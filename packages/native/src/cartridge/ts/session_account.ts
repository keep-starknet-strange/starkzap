import type { Call, PaymasterTimeBounds } from "starknet";
import { SessionProtocolError } from "@/cartridge/ts/errors";
import type { SessionRegistration } from "@/cartridge/ts/session_api";
import { asRecord } from "@/cartridge/ts/shared";

export interface TsSessionExecutionDetails {
  feeMode: { mode: "sponsored" };
  timeBounds?: PaymasterTimeBounds;
}

export interface TsSessionExecutionContext {
  calls: Call[];
  details?: TsSessionExecutionDetails;
  rpcUrl: string;
  chainId: string;
  session: SessionRegistration;
  sessionPrivateKey: string;
  policyRoot: string;
  sessionKeyGuid: string;
}

export type TsExecuteFromOutside = (
  context: TsSessionExecutionContext
) => Promise<unknown>;

export type TsExecute = (
  context: TsSessionExecutionContext
) => Promise<unknown>;

export interface TsSessionAccountOptions {
  rpcUrl: string;
  chainId: string;
  session: SessionRegistration;
  sessionPrivateKey: string;
  policyRoot: string;
  sessionKeyGuid: string;
  executeFromOutside?: TsExecuteFromOutside;
  execute?: TsExecute;
  logger?: Pick<Console, "info" | "warn" | "error">;
}

// When executeFromOutside (SNIP-9) fails with one of these error codes or
// message patterns, the adapter falls back to direct execute. This handles
// accounts that do not support outside execution or have stale nonces.
const EXECUTE_FALLBACK_ERROR_CODES = new Set([
  "OUTSIDE_EXECUTION",
  "OUTSIDE_EXECUTION_AUTHORIZATION_FAILED",
  "OUTSIDE_EXECUTION_MANUAL_EXECUTION_REQUIRED",
  "OUTSIDE_EXECUTION_NOT_SUPPORTED",
  "OUTSIDE_EXECUTION_UNSUPPORTED",
]);

const EXECUTE_FALLBACK_MESSAGE_PATTERNS = [
  /\baccount is not compatible with snip-9\b/i,
  /\bmanual execution required\b/i,
  /(?:^|:\s*)(?:outside execution )?authorization failed(?:[.!)]|\s|$)/i,
  /(?:^|:\s*)not implemented:\s*(outside execution|execute_from_outside|snip-9)(?:[.!)]|\s|$)/i,
  /\bfailed to check if nonce is valid\b/i,
  /\boutside_execution_nonce\b/i,
  /\bis_valid_outside_execution_nonce\b/i,
  /(?:^|:\s*)requested entrypoint does not exist(?:[.!)]|\s|$)/i,
  /(?:^|:\s*)entrypoint does not exist(?:[.!)]|\s|$)/i,
];

function toMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  const record = asRecord(error);
  if (record && typeof record.message === "string") {
    return record.message;
  }
  return String(error);
}

function toCode(error: unknown, depth = 0): string | null {
  if (depth > 2) {
    return null;
  }

  const record = asRecord(error);
  if (!record) {
    return null;
  }

  if (typeof record.code === "string" && record.code.trim()) {
    return record.code.trim().toUpperCase();
  }

  return record.cause !== undefined ? toCode(record.cause, depth + 1) : null;
}

function shouldFallbackToExecute(error: unknown): boolean {
  const code = toCode(error);
  if (code && EXECUTE_FALLBACK_ERROR_CODES.has(code)) {
    return true;
  }

  const message = toMessage(error).trim();
  return EXECUTE_FALLBACK_MESSAGE_PATTERNS.some((pattern) =>
    pattern.test(message)
  );
}

export class TsSessionAccount {
  private readonly rpcUrl: string;
  private readonly chainId: string;
  private readonly session: SessionRegistration;
  private sessionPrivateKey: string | null;
  private readonly policyRoot: string;
  private readonly sessionKeyGuid: string;
  private readonly executeFromOutsideImpl: TsExecuteFromOutside | undefined;
  private readonly executeImpl: TsExecute | undefined;
  private readonly logger: Pick<Console, "info" | "warn" | "error"> | undefined;

  constructor(options: TsSessionAccountOptions) {
    this.rpcUrl = options.rpcUrl;
    this.chainId = options.chainId;
    this.session = options.session;
    this.sessionPrivateKey = options.sessionPrivateKey;
    this.policyRoot = options.policyRoot;
    this.sessionKeyGuid = options.sessionKeyGuid;
    this.executeFromOutsideImpl = options.executeFromOutside;
    this.executeImpl = options.execute;
    this.logger = options.logger;
  }

  address(): string {
    return this.session.address;
  }

  username(): string {
    return this.session.username;
  }

  sessionId(): string {
    return this.session.sessionKeyGuid;
  }

  disconnect(): void {
    this.sessionPrivateKey = null;
  }

  isExpired(nowMs: number = Date.now()): boolean {
    const expiresAtSeconds = Number(this.session.expiresAt);
    if (!Number.isFinite(expiresAtSeconds)) {
      return true;
    }
    return nowMs >= expiresAtSeconds * 1000;
  }

  async executeWithFallback(
    calls: Call[],
    details?: TsSessionExecutionDetails
  ): Promise<unknown> {
    if (this.isExpired()) {
      throw new SessionProtocolError(
        "Cartridge TS session is expired and cannot execute transactions."
      );
    }

    const sessionPrivateKey = this.sessionPrivateKey;
    if (!sessionPrivateKey) {
      throw new SessionProtocolError(
        "Cartridge TS session has been disconnected and cannot execute transactions."
      );
    }

    const context: TsSessionExecutionContext = {
      calls,
      ...(details ? { details } : {}),
      rpcUrl: this.rpcUrl,
      chainId: this.chainId,
      session: this.session,
      sessionPrivateKey,
      policyRoot: this.policyRoot,
      sessionKeyGuid: this.sessionKeyGuid,
    };

    let outsideExecutionError: unknown;

    if (this.executeFromOutsideImpl) {
      try {
        return await this.executeFromOutsideImpl(context);
      } catch (error) {
        if (!shouldFallbackToExecute(error)) {
          throw error;
        }
        this.logger?.warn?.(
          `[starkzap] cartridge-ts executeFromOutside failed, falling back to direct execute: ${toMessage(error)}`
        );
        outsideExecutionError = error;
      }
    }

    if (this.executeImpl) {
      return this.executeImpl(context);
    }

    if (outsideExecutionError) {
      throw outsideExecutionError;
    }

    throw new SessionProtocolError(
      "TS Cartridge adapter execution is not configured. Provide executeFromOutside or execute in createCartridgeTsAdapter()."
    );
  }
}

export function extractTransactionHash(response: unknown): string | null {
  if (typeof response === "string" && response.startsWith("0x")) {
    return response;
  }

  if (!response || typeof response !== "object") {
    return null;
  }

  const result = response as {
    transaction_hash?: unknown;
    transactionHash?: unknown;
    data?: { transaction_hash?: unknown; transactionHash?: unknown };
  };
  const txHash =
    result.transaction_hash ??
    result.transactionHash ??
    result.data?.transaction_hash ??
    result.data?.transactionHash;
  return typeof txHash === "string" && txHash ? txHash : null;
}
