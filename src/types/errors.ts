export class StarkzapTransactionError extends Error {
  private readonly cause: TransactionErrorCause;

  constructor(cause: TransactionErrorCause, message?: string) {
    super(message);
    this.cause = cause;
  }
}

export enum TransactionErrorCause {
  NO_TX = "NO_TX",
  USER_REJECTED = "USER_REJECTED",
  INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE",
  APPROVE_FAILED = "APPROVE_FAILED",
}
