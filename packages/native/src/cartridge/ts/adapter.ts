import { ec, encode, stark, type Call } from "starknet";
import type {
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
} from "@/cartridge/ts/errors";
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
} from "@/cartridge/ts/outside_execution_v3";

const DEFAULT_CARTRIDGE_URL = "https://x.cartridge.gg";
const DEFAULT_CARTRIDGE_API_URL = "https://api.cartridge.gg";
const DEFAULT_REDIRECT_QUERY_NAME = "startapp";

type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }
) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
}>;

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

function ensureFetch(fetchImpl?: FetchLike): FetchLike {
  if (fetchImpl) {
    return fetchImpl;
  }
  if (typeof fetch === "function") {
    return fetch as unknown as FetchLike;
  }
  throw new SessionProtocolError(
    "No fetch implementation available for Cartridge V3 outside execution."
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
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
    const fetchFn = ensureFetch(options.fetchImpl);
    const resolvedPolicies = await (
      options.resolvePresetPolicies ?? resolvePresetPolicies
    )({
      preset: args.preset,
      chainId: args.chainId,
      fetchImpl: fetchFn,
      ...(options.presetConfigBaseUrl && {
        presetBaseUrl: options.presetConfigBaseUrl,
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
  const errorRecord = asRecord(record?.error);
  const errorData = errorRecord?.data;
  return (
    extractTransactionHash(errorData) ??
    extractTransactionHash(asRecord(errorData)?.result) ??
    null
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

  if (options.subscribeSession) {
    return options.subscribeSession({
      cartridgeApiUrl: options.cartridgeApiUrl ?? DEFAULT_CARTRIDGE_API_URL,
      sessionKeyGuid,
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    });
  }

  return waitForSessionSubscription({
    cartridgeApiUrl: options.cartridgeApiUrl ?? DEFAULT_CARTRIDGE_API_URL,
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

export function createCartridgeTsAdapter(
  options: CreateCartridgeTsAdapterOptions = {}
): CartridgeNativeAdapter {
  return {
    async connect(args: CartridgeNativeConnectArgs) {
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
        baseUrl: args.url || options.cartridgeUrl || DEFAULT_CARTRIDGE_URL,
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
        `[starkzap] cartridge-ts session request url=${sessionUrl}`
      );

      const session = await resolveSessionRegistration(
        args,
        sessionUrl,
        sessionKeyGuid,
        options
      );
      options.logger?.info?.(
        `[starkzap] cartridge-ts session resolved address=${session.address} rpc=${args.rpcUrl}`
      );

      const tsSessionAccount = new TsSessionAccount({
        rpcUrl: args.rpcUrl,
        chainId: args.chainId,
        session,
        sessionPrivateKey: formattedPrivateKey,
        policyRoot,
        sessionKeyGuid,
        executeFromOutside:
          options.executeFromOutside ??
          (async ({
            calls,
            chainId,
            details,
            rpcUrl,
            session,
            sessionPrivateKey,
          }) => {
            const { outsideExecution, signature } =
              buildSignedOutsideExecutionV3({
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

            const fetchFn = ensureFetch(options.fetchImpl);
            const response = await fetchFn(rpcUrl, {
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
            });

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
                return { transaction_hash: txHash };
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
          }),
        ...(options.execute ? { execute: options.execute } : {}),
      });

      return {
        account: {
          address: tsSessionAccount.address(),
          execute: async (
            calls: Call[],
            details?: TsSessionExecutionDetails
          ) => {
            const response = await tsSessionAccount.executeWithFallback(
              calls,
              details
            );
            const transactionHash = extractTransactionHash(response);
            if (!transactionHash) {
              throw new SessionProtocolError(
                "TS Cartridge adapter execute call did not return a transaction hash."
              );
            }
            return { transaction_hash: transactionHash };
          },
        },
        username: async () => tsSessionAccount.username(),
        disconnect: async () => {
          options.logger?.info?.(
            `[starkzap] cartridge-ts disconnect sessionKeyGuid=${sessionKeyGuid}`
          );
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
