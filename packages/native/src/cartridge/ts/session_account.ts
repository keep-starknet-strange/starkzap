import type { Call, PaymasterTimeBounds } from "starknet";
import { SessionProtocolError } from "@/cartridge/ts/errors";
import type { SessionRegistration } from "@/cartridge/ts/session_api";

export interface TsSessionExecutionDetails {
  feeMode: { mode: "sponsored" };
  timeBounds?: PaymasterTimeBounds;
}

export interface TsSessionExecutionContext {
  calls: Call[];
  details?: TsSessionExecutionDetails;
  rpcUrl: string;
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
  session: SessionRegistration;
  sessionPrivateKey: string;
  policyRoot: string;
  sessionKeyGuid: string;
  executeFromOutside?: TsExecuteFromOutside;
  execute?: TsExecute;
}

function toMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function shouldFallbackToExecute(error: unknown): boolean {
  const message = toMessage(error).toLowerCase();
  return (
    message.includes("outside") ||
    message.includes("authorization") ||
    message.includes("not implemented") ||
    message.includes("manual execution")
  );
}

export class TsSessionAccount {
  private readonly rpcUrl: string;
  private readonly session: SessionRegistration;
  private readonly sessionPrivateKey: string;
  private readonly policyRoot: string;
  private readonly sessionKeyGuid: string;
  private readonly executeFromOutsideImpl: TsExecuteFromOutside | undefined;
  private readonly executeImpl: TsExecute | undefined;

  constructor(options: TsSessionAccountOptions) {
    this.rpcUrl = options.rpcUrl;
    this.session = options.session;
    this.sessionPrivateKey = options.sessionPrivateKey;
    this.policyRoot = options.policyRoot;
    this.sessionKeyGuid = options.sessionKeyGuid;
    this.executeFromOutsideImpl = options.executeFromOutside;
    this.executeImpl = options.execute;
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

    const context: TsSessionExecutionContext = {
      calls,
      ...(details ? { details } : {}),
      rpcUrl: this.rpcUrl,
      session: this.session,
      sessionPrivateKey: this.sessionPrivateKey,
      policyRoot: this.policyRoot,
      sessionKeyGuid: this.sessionKeyGuid,
    };

    if (this.executeFromOutsideImpl) {
      try {
        return await this.executeFromOutsideImpl(context);
      } catch (error) {
        if (!shouldFallbackToExecute(error)) {
          throw error;
        }
      }
    }

    if (this.executeImpl) {
      return this.executeImpl(context);
    }

    throw new SessionProtocolError(
      "TS Cartridge adapter execution is not configured. Provide executeFromOutside or execute in createCartridgeTsAdapter()."
    );
  }
}

export function extractTransactionHash(response: unknown): string | null {
  if (typeof response === "string" && response) {
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
