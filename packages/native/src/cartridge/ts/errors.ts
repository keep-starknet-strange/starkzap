export class SessionProtocolError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "SessionProtocolError";
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

export class SessionTimeoutError extends SessionProtocolError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "SessionTimeoutError";
  }
}

export class SessionRejectedError extends SessionProtocolError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "SessionRejectedError";
  }
}
