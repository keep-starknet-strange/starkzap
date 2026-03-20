import { describe, expect, it } from "vitest";
import {
  SessionProtocolError,
  SessionRejectedError,
  SessionTimeoutError,
} from "@/cartridge/ts/errors";

describe("session errors", () => {
  it("attaches cause as a non-enumerable property when provided", () => {
    const cause = new Error("transport failed");
    const error = new SessionProtocolError("session failed", cause);

    expect(error.cause).toBe(cause);
    expect(Object.prototype.propertyIsEnumerable.call(error, "cause")).toBe(
      false
    );
  });

  it("preserves cause through protocol error subclasses", () => {
    const cause = new Error("timed out");
    const timeoutError = new SessionTimeoutError("request timed out", cause);
    const rejectedError = new SessionRejectedError("session rejected", cause);

    expect(timeoutError.cause).toBe(cause);
    expect(rejectedError.cause).toBe(cause);
  });
});
