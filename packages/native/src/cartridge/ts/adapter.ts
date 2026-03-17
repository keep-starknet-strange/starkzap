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
  SessionTimeoutError,
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
  listCallsMissingPolicyProofs,
} from "@/cartridge/ts/outside_execution_v3";

const DEFAULT_CARTRIDGE_URL = "https://x.cartridge.gg";
const DEFAULT_CARTRIDGE_API_URL = "https://api.cartridge.gg";
const DEFAULT_REDIRECT_QUERY_NAME = "startapp";
const DEFAULT_EXECUTE_FROM_OUTSIDE_REQUEST_TIMEOUT_MS = 15_000;

type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: unknown;
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

async function fetchWithTimeout(
  fetchFn: FetchLike,
  input: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
  requestTimeoutMs: number
): Promise<Awaited<ReturnType<FetchLike>>> {
  const timeoutMessage = `cartridge_addExecuteOutsideTransaction timed out after ${requestTimeoutMs}ms.`;
  if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) {
    return fetchFn(input, init);
  }

  const maybeAbortController = (
    globalThis as unknown as {
      AbortController?: new () => { signal: unknown; abort(): void };
    }
  ).AbortController;
  if (typeof maybeAbortController === "function") {
    const controller = new maybeAbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, requestTimeoutMs);
    try {
      return await fetchFn(input, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      const name = error instanceof Error ? error.name : "";
      if (name === "AbortError" || message.includes("abort")) {
        throw new SessionTimeoutError(timeoutMessage, error);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      fetchFn(input, init),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new SessionTimeoutError(timeoutMessage));
        }, requestTimeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
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
            const missingPolicyProofs = listCallsMissingPolicyProofs(
              calls,
              policyProofIndex
            );
            if (missingPolicyProofs.length > 0) {
              throw new SessionProtocolError(
                `Cannot execute from outside because session policy proofs are missing for: ${missingPolicyProofs.join(", ")}.`
              );
            }

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
              options.executeFromOutsideRequestTimeoutMs ??
                DEFAULT_EXECUTE_FROM_OUTSIDE_REQUEST_TIMEOUT_MS
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

      let isConnected = true;
      const sessionAccountWithCleanup = tsSessionAccount as TsSessionAccount & {
        disconnect?: () => Promise<void> | void;
        close?: () => Promise<void> | void;
      };

      return {
        account: {
          address: tsSessionAccount.address(),
          execute: async (
            calls: Call[],
            details?: TsSessionExecutionDetails
          ) => {
            if (!isConnected) {
              throw new SessionProtocolError(
                "Cartridge TS session has been disconnected and cannot execute transactions."
              );
            }
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
          if (!isConnected) {
            return;
          }
          isConnected = false;
          options.logger?.info?.(
            `[starkzap] cartridge-ts disconnect sessionKeyGuid=${sessionKeyGuid}`
          );
          const disconnectSession =
            sessionAccountWithCleanup.disconnect?.bind(tsSessionAccount) ??
            sessionAccountWithCleanup.close?.bind(tsSessionAccount);
          await disconnectSession?.();
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
