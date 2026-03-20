function attachCause(error: Error, cause?: unknown): void {
  if (cause === undefined) {
    return;
  }

  Object.defineProperty(error, "cause", {
    value: cause,
    configurable: true,
    enumerable: false,
    writable: true,
  });
}

export class SessionProtocolError extends Error {
  declare cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "SessionProtocolError";
    attachCause(this, cause);
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
