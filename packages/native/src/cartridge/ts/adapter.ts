import {
  Account,
  RpcProvider,
  ec,
  encode,
  stark,
  type Call,
  type PaymasterDetails,
} from "starknet";
import type {
  CartridgeNativeAdapter,
  CartridgeNativeConnectArgs,
} from "@/cartridge/types";
import { deriveSessionSignerGuid } from "@/cartridge/ts/guid";
import { computePolicyMerkle } from "@/cartridge/ts/merkle";
import { canonicalizeSessionPolicies } from "@/cartridge/ts/policy";
import {
  buildCartridgeSessionUrl,
  extractEncodedSessionFromUrl,
  parseSessionFromEncodedRedirect,
  type SessionRegistration,
  waitForSessionSubscription,
} from "@/cartridge/ts/session_api";
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
  redirectQueryName?: string;
  sessionRegistrationTimeoutMs?: number;
  sessionRequestTimeoutMs?: number;
  openSession?: (args: OpenSessionArgs) => Promise<OpenSessionResult>;
  subscribeSession?: (args: {
    cartridgeApiUrl: string;
    sessionKeyGuid: string;
    fetchImpl?: FetchLike;
  }) => Promise<SessionRegistration>;
  fetchImpl?: FetchLike;
  executeFromOutside?: TsExecuteFromOutside;
  execute?: TsExecute;
  logger?: Pick<Console, "info" | "warn" | "error">;
}

const accountCache = new Map<string, Account>();

function getOrCreateAccount(
  rpcUrl: string,
  address: string,
  signer: string
): Account {
  const key = `${rpcUrl}:${address}:${signer}`;
  const cached = accountCache.get(key);
  if (cached) {
    return cached;
  }

  const account = new Account({
    provider: new RpcProvider({
      nodeUrl: rpcUrl,
    }),
    address,
    signer,
  });
  accountCache.set(key, account);
  return account;
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
      const canonicalPolicies = canonicalizeSessionPolicies(
        args.policies ?? []
      );
      const { root: policyRoot } = computePolicyMerkle(canonicalPolicies);
      const sessionKeyGuid = deriveSessionSignerGuid(formattedPrivateKey);
      const sessionUrl = buildCartridgeSessionUrl({
        baseUrl: args.url || options.cartridgeUrl || DEFAULT_CARTRIDGE_URL,
        publicKey: sessionPublicKey,
        policies: canonicalPolicies,
        rpcUrl: args.rpcUrl,
        ...(args.redirectUrl ? { redirectUrl: args.redirectUrl } : {}),
        redirectQueryName:
          options.redirectQueryName ?? DEFAULT_REDIRECT_QUERY_NAME,
      });

      const session = await resolveSessionRegistration(
        args,
        sessionUrl,
        sessionKeyGuid,
        options
      );

      const tsSessionAccount = new TsSessionAccount({
        rpcUrl: args.rpcUrl,
        session,
        sessionPrivateKey: formattedPrivateKey,
        policyRoot,
        sessionKeyGuid,
        ...(options.executeFromOutside
          ? { executeFromOutside: options.executeFromOutside }
          : {}),
        execute:
          options.execute ??
          (async ({ calls, details, rpcUrl, session, sessionPrivateKey }) => {
            const account = getOrCreateAccount(
              rpcUrl,
              session.address,
              sessionPrivateKey
            );
            const paymasterDetails = (details ?? {
              feeMode: { mode: "sponsored" },
            }) as PaymasterDetails;
            return account.executePaymasterTransaction(calls, paymasterDetails);
          }),
      });

      return {
        account: {
          address: tsSessionAccount.address(),
          executePaymasterTransaction: async (
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
