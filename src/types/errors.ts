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

export enum FeeErrorCause {
  NO_TOKEN_CONTRACT = "NO_TOKEN_CONTRACT",
  APPROVAL_FEE_ERROR = "APPROVAL_FEE_ERROR",
  NON_DEPLOYED_ACCOUNT_ERROR = "NON_DEPLOYED",
  GENERIC_L2_FEE_ERROR = "L2_FEE_ERROR",
  GENERIC_L1_FEE_ERROR = "L1_FEE_ERROR",
  AW_FEE_ERROR = "AW_FEE_ERROR",
}
