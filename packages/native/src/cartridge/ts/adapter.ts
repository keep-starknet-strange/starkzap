import { ec, encode, stark, type Call } from "starknet";
import type {
  CartridgeExecutionResult,
  CartridgeNativeAdapter,
  CartridgeNativeConnectArgs,
} from "@/cartridge/types";
import { deriveSessionSignerGuid } from "@/cartridge/ts/guid";
import {
  computePolicyMerkle,
  computePolicyMerkleProofs,
} from "@/cartridge/ts/merkle";
import {
  canonicalizeSessionPolicies,
  hasPoliciesInput,
} from "@/cartridge/ts/policy";
import {
  buildCartridgeSessionUrl,
  extractEncodedSessionFromUrl,
  parseSessionFromEncodedRedirect,
  type SessionRegistration,
  waitForSessionSubscription,
} from "@/cartridge/ts/session_api";
import { resolvePresetPolicies } from "@/cartridge/ts/preset";
import {
  SessionProtocolError,
  SessionRejectedError,
  SessionTimeoutError,
} from "@/cartridge/ts/errors";
import {
  asRecord,
  ensureFetch,
  fetchWithTimeout,
  normalizeHttpUrl,
  type FetchLike,
} from "@/cartridge/ts/shared";
import {
  extractTransactionHash,
  TsSessionAccount,
  type TsExecute,
  type TsExecuteFromOutside,
  type TsSessionExecutionDetails,
} from "@/cartridge/ts/session_account";
import {
  buildSignedOutsideExecutionV3,
  createPolicyProofIndex,
  listCallsMissingPolicyProofs,
} from "@/cartridge/ts/outside_execution_v3";

const DEFAULT_CARTRIDGE_URL = "https://x.cartridge.gg";
const DEFAULT_CARTRIDGE_API_URL = "https://api.cartridge.gg";
const DEFAULT_REDIRECT_QUERY_NAME = "startapp";
const DEFAULT_EXECUTE_FROM_OUTSIDE_REQUEST_TIMEOUT_MS = 15_000;

export interface OpenSessionArgs {
  url: string;
  redirectUrl?: string;
  redirectQueryName: string;
}

export interface OpenSessionResult {
  encodedSession?: string;
  callbackUrl?: string;
  status?: "success" | "cancel" | "dismiss";
}

export interface CreateCartridgeTsAdapterOptions {
  cartridgeUrl?: string;
  cartridgeApiUrl?: string;
  presetConfigBaseUrl?: string;
  redirectQueryName?: string;
  sessionRegistrationTimeoutMs?: number;
  sessionRequestTimeoutMs?: number;
  executeFromOutsideRequestTimeoutMs?: number;
  openSession?: (args: OpenSessionArgs) => Promise<OpenSessionResult>;
  subscribeSession?: (args: {
    cartridgeApiUrl: string;
    sessionKeyGuid: string;
    fetchImpl?: FetchLike;
  }) => Promise<SessionRegistration>;
  resolvePresetPolicies?: (args: {
    preset: string;
    chainId: string;
    fetchImpl: FetchLike;
    presetBaseUrl?: string;
  }) => Promise<import("@/cartridge/types").CartridgeSessionPolicies>;
  fetchImpl?: FetchLike;
  executeFromOutside?: TsExecuteFromOutside;
  execute?: TsExecute;
  logger?: Pick<Console, "info" | "warn" | "error">;
}

function normalizeConfiguredUrl(
  value: string | undefined,
  label: string
): string | undefined {
  return value ? normalizeHttpUrl(value, label) : undefined;
}

function readJsonRpcErrorMessage(payload: unknown): string | null {
  const record = asRecord(payload);
  const errorRecord = asRecord(record?.error);
  if (!errorRecord) {
    return null;
  }
  const message = errorRecord.message;
  if (typeof message === "string" && message.trim()) {
    return message.trim();
  }
  return "Cartridge RPC returned an unknown error.";
}

async function resolveEffectivePolicies(
  args: CartridgeNativeConnectArgs,
  options: CreateCartridgeTsAdapterOptions
): Promise<{
  effectivePolicies: NonNullable<CartridgeNativeConnectArgs["policies"]>;
  sessionUrlPolicies?: CartridgeNativeConnectArgs["policies"];
  sessionUrlPreset?: string;
}> {
  const hasManualPolicies = hasPoliciesInput(args.policies);

  if (!hasManualPolicies && !args.preset) {
    throw new SessionProtocolError(
      "Cartridge TS adapter requires either policies or a preset."
    );
  }

  if (
    args.preset &&
    (!hasManualPolicies || !args.shouldOverridePresetPolicies)
  ) {
    const presetConfigBaseUrl = normalizeConfiguredUrl(
      options.presetConfigBaseUrl,
      "presetConfigBaseUrl"
    );
    const fetchFn = ensureFetch(
      options.fetchImpl,
      "No fetch implementation available for Cartridge V3 outside execution.",
      (message) => new SessionProtocolError(message)
    );
    const resolvedPolicies = await (
      options.resolvePresetPolicies ?? resolvePresetPolicies
    )({
      preset: args.preset,
      chainId: args.chainId,
      fetchImpl: fetchFn,
      ...(presetConfigBaseUrl && {
        presetBaseUrl: presetConfigBaseUrl,
      }),
    });

    if (!hasPoliciesInput(resolvedPolicies)) {
      throw new SessionProtocolError(
        `Preset "${args.preset}" did not resolve to any policies for chain ${args.chainId}.`
      );
    }

    return {
      effectivePolicies: resolvedPolicies,
      sessionUrlPreset: args.preset,
    };
  }

  if (!args.policies || !hasManualPolicies) {
    throw new SessionProtocolError(
      "Manual Cartridge policies were selected but no policies were provided."
    );
  }

  return {
    effectivePolicies: args.policies,
    sessionUrlPolicies: args.policies,
  };
}

function extractJsonRpcErrorTransactionHash(payload: unknown): string | null {
  const record = asRecord(payload);
  const errorData = asRecord(record?.error)?.data;
  return (
    extractTransactionHash(errorData) ??
    extractTransactionHash(asRecord(errorData)?.result)
  );
}

async function resolveSessionRegistration(
  args: CartridgeNativeConnectArgs,
  sessionUrl: string,
  sessionKeyGuid: string,
  options: CreateCartridgeTsAdapterOptions
): Promise<SessionRegistration> {
  const redirectQueryName =
    options.redirectQueryName ?? DEFAULT_REDIRECT_QUERY_NAME;
  const tryParseRedirectPayload = (
    encodedSession: string,
    source: "encodedSession" | "callbackUrl"
  ): SessionRegistration | null => {
    try {
      return parseSessionFromEncodedRedirect(encodedSession, {
        defaultSessionKeyGuid: sessionKeyGuid,
      });
    } catch (error) {
      if (error instanceof SessionRejectedError) {
        throw error;
      }
      if (error instanceof SessionProtocolError) {
        options.logger?.warn?.(
          `[starkzap] cartridge-ts ${source} payload parse failed (${error.message}); falling back to subscription polling`
        );
        return null;
      }
      throw error;
    }
  };

  if (options.openSession) {
    const openResult = await options.openSession({
      url: sessionUrl,
      ...(args.redirectUrl ? { redirectUrl: args.redirectUrl } : {}),
      redirectQueryName,
    });

    if (openResult.status === "cancel" || openResult.status === "dismiss") {
      throw new SessionRejectedError(
        "Cartridge session authorization was cancelled."
      );
    }

    if (openResult.encodedSession) {
      const parsed = tryParseRedirectPayload(
        openResult.encodedSession,
        "encodedSession"
      );
      if (parsed) {
        return parsed;
      }
    }

    if (openResult.callbackUrl) {
      const encodedSession = extractEncodedSessionFromUrl(
        openResult.callbackUrl,
        redirectQueryName
      );
      if (encodedSession) {
        const parsed = tryParseRedirectPayload(encodedSession, "callbackUrl");
        if (parsed) {
          return parsed;
        }
      }
    }
  }

  const cartridgeApiUrl =
    normalizeConfiguredUrl(options.cartridgeApiUrl, "cartridgeApiUrl") ??
    DEFAULT_CARTRIDGE_API_URL;

  if (options.subscribeSession) {
    return options.subscribeSession({
      cartridgeApiUrl,
      sessionKeyGuid,
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    });
  }
  return waitForSessionSubscription({
    cartridgeApiUrl,
    sessionKeyGuid,
    ...(options.sessionRegistrationTimeoutMs
      ? { timeoutMs: options.sessionRegistrationTimeoutMs }
      : {}),
    ...(options.sessionRequestTimeoutMs
      ? { requestTimeoutMs: options.sessionRequestTimeoutMs }
      : {}),
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });
}

function createDefaultExecuteFromOutside(
  options: CreateCartridgeTsAdapterOptions,
  policyProofIndex: ReadonlyMap<string, string[]>
): TsExecuteFromOutside {
  return async ({
    calls,
    chainId,
    details,
    rpcUrl,
    session,
    sessionPrivateKey,
    policyRoot,
    sessionKeyGuid,
  }) => {
    const missingPolicyProofs = listCallsMissingPolicyProofs(
      calls,
      policyProofIndex
    );
    if (missingPolicyProofs.length > 0) {
      throw new SessionProtocolError(
        `Cannot execute from outside because session policy proofs are missing for: ${missingPolicyProofs.join(", ")}.`
      );
    }

    const { outsideExecution, signature } = buildSignedOutsideExecutionV3({
      calls,
      ...(details ? { details } : {}),
      chainId,
      session,
      sessionPrivateKey,
      policyRoot,
      sessionKeyGuid,
      policyProofIndex,
    });

    options.logger?.info?.(
      "[starkzap] cartridge-ts executing via cartridge_addExecuteOutsideTransaction (pure TS V3)"
    );

    const fetchFn = ensureFetch(
      options.fetchImpl,
      "No fetch implementation available for Cartridge V3 outside execution.",
      (message) => new SessionProtocolError(message)
    );
    // Timeout for the cartridge_addExecuteOutsideTransaction JSON-RPC call.
    const requestTimeoutMs =
      options.executeFromOutsideRequestTimeoutMs ??
      DEFAULT_EXECUTE_FROM_OUTSIDE_REQUEST_TIMEOUT_MS;
    const response = await fetchWithTimeout(
      fetchFn,
      rpcUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: 1,
          jsonrpc: "2.0",
          method: "cartridge_addExecuteOutsideTransaction",
          params: {
            address: session.address,
            outside_execution: outsideExecution,
            signature,
          },
        }),
      },
      {
        requestTimeoutMs,
        timeoutMessage: `cartridge_addExecuteOutsideTransaction timed out after ${requestTimeoutMs}ms.`,
        createTimeoutError: (message, cause) =>
          new SessionTimeoutError(message, cause),
      }
    );

    if (!response.ok) {
      throw new SessionProtocolError(
        `cartridge_addExecuteOutsideTransaction failed with HTTP ${response.status} ${response.statusText}.`
      );
    }

    const payload = await response.json();
    const errorMessage = readJsonRpcErrorMessage(payload);
    if (errorMessage) {
      const txHash = extractJsonRpcErrorTransactionHash(payload);
      if (txHash) {
        options.logger?.warn?.(
          `[starkzap] cartridge-ts recovered tx hash from cartridge_addExecuteOutsideTransaction error payload txHash=${txHash} message=${errorMessage}`
        );
        return {
          transaction_hash: txHash,
          recovered_from_rpc_error: true,
        } satisfies CartridgeExecutionResult;
      }
      throw new SessionProtocolError(
        `cartridge_addExecuteOutsideTransaction failed: ${errorMessage}`
      );
    }

    const payloadRecord = asRecord(payload);
    const result = payloadRecord?.result;
    const txHash = extractTransactionHash(result);
    if (!txHash) {
      throw new SessionProtocolError(
        "cartridge_addExecuteOutsideTransaction returned an invalid response (missing transaction hash)."
      );
    }

    return { transaction_hash: txHash };
  };
}

export function createCartridgeTsAdapter(
  options: CreateCartridgeTsAdapterOptions = {}
): CartridgeNativeAdapter {
  return {
    async connect(args: CartridgeNativeConnectArgs) {
      const cartridgeBaseUrl = args.url
        ? normalizeHttpUrl(args.url, "url")
        : (normalizeConfiguredUrl(options.cartridgeUrl, "cartridgeUrl") ??
          DEFAULT_CARTRIDGE_URL);
      const sessionPrivateKey = stark.randomAddress();
      const formattedPrivateKey = encode.addHexPrefix(sessionPrivateKey);
      const sessionPublicKey = ec.starkCurve.getStarkKey(sessionPrivateKey);
      const { effectivePolicies, sessionUrlPolicies, sessionUrlPreset } =
        await resolveEffectivePolicies(args, options);
      const canonicalPolicies = canonicalizeSessionPolicies(effectivePolicies);
      const { root: policyRoot } = computePolicyMerkle(canonicalPolicies);
      const policyProofIndex = createPolicyProofIndex(
        computePolicyMerkleProofs(canonicalPolicies)
      );
      const sessionKeyGuid = deriveSessionSignerGuid(formattedPrivateKey);
      const sessionUrl = buildCartridgeSessionUrl({
        baseUrl: cartridgeBaseUrl,
        publicKey: sessionPublicKey,
        ...(sessionUrlPolicies ? { policies: sessionUrlPolicies } : {}),
        rpcUrl: args.rpcUrl,
        ...(sessionUrlPreset ? { preset: sessionUrlPreset } : {}),
        ...(args.forceNewSession ? { needsSessionCreation: true } : {}),
        ...(args.redirectUrl ? { redirectUrl: args.redirectUrl } : {}),
        redirectQueryName:
          options.redirectQueryName ?? DEFAULT_REDIRECT_QUERY_NAME,
      });
      options.logger?.info?.(
        "[starkzap] cartridge-ts session request URL generated"
      );

      const session = await resolveSessionRegistration(
        args,
        sessionUrl,
        sessionKeyGuid,
        options
      );
      options.logger?.info?.(
        `[starkzap] cartridge-ts session resolved address=${session.address}`
      );

      let activeSessionAccount: TsSessionAccount | null = new TsSessionAccount({
        rpcUrl: args.rpcUrl,
        chainId: args.chainId,
        session,
        sessionPrivateKey: formattedPrivateKey,
        policyRoot,
        sessionKeyGuid,
        executeFromOutside:
          options.executeFromOutside ??
          createDefaultExecuteFromOutside(options, policyProofIndex),
        ...(options.execute ? { execute: options.execute } : {}),
        ...(options.logger ? { logger: options.logger } : {}),
      });

      const accountAddress = activeSessionAccount.address();
      const sessionUsername = activeSessionAccount.username();
      let isConnected = true;

      return {
        account: {
          address: accountAddress,
          execute: async (
            calls: Call[],
            details?: TsSessionExecutionDetails
          ) => {
            const currentSessionAccount = activeSessionAccount;
            if (!isConnected || !currentSessionAccount) {
              throw new SessionProtocolError(
                "Cartridge TS session has been disconnected and cannot execute transactions."
              );
            }
            const response = await currentSessionAccount.executeWithFallback(
              calls,
              details
            );
            const transactionHash = extractTransactionHash(response);
            if (!transactionHash) {
              throw new SessionProtocolError(
                "TS Cartridge adapter execute call did not return a transaction hash."
              );
            }
            const responseRecord = asRecord(response);
            return {
              transaction_hash: transactionHash,
              ...(responseRecord?.recovered_from_rpc_error === true && {
                recovered_from_rpc_error: true as const,
              }),
            };
          },
        },
        username: async () => sessionUsername,
        disconnect: async () => {
          const currentSessionAccount = activeSessionAccount;
          if (!isConnected || !currentSessionAccount) {
            return;
          }
          isConnected = false;
          activeSessionAccount = null;
          options.logger?.info?.(
            `[starkzap] cartridge-ts disconnect sessionKeyGuid=${sessionKeyGuid}`
          );
          currentSessionAccount.disconnect();
        },
        controller: {
          type: "cartridge-ts-session",
          sessionKeyGuid,
          policyRoot,
          sessionUrl,
        },
      };
    },
  };
}
