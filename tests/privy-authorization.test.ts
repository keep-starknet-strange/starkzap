import { describe, expect, it } from "vitest";
import {
  PrivySigningRequestError,
  resolvePrivySigningRequest,
} from "../examples/server/privy-signing";

describe("resolvePrivySigningRequest", () => {
  it.each([
    undefined,
    null,
    123,
    "0x",
    "123",
    "0xgg",
    " 0x1",
    `0x${"a".repeat(65)}`,
  ])("rejects malformed hash %s", (hash) => {
    expect(() =>
      resolvePrivySigningRequest({ hash }, "wallet-1", "token-1")
    ).toThrow("hash must be 0x-prefixed hex of at most 32 bytes");
  });

  it.each([null, 123, "", "not-base64!", "abc", "AAAA====", "A".repeat(1_028)])(
    "rejects malformed authorization signature",
    (authorizationSignature) => {
      expect(() =>
        resolvePrivySigningRequest(
          { hash: "0xabc", authorizationSignature },
          "wallet-1",
          "token-1"
        )
      ).toThrow("authorizationSignature must be non-empty base64");
    }
  );

  it("rejects a cross-wallet request with status 403", () => {
    let error: unknown;
    try {
      resolvePrivySigningRequest(
        { walletId: "wallet-2", hash: "0xabc" },
        "wallet-1",
        "token-1"
      );
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(PrivySigningRequestError);
    expect(error).toMatchObject({
      status: 403,
      message: "walletId does not belong to the authenticated user",
    });
  });

  it("forwards the exact authorization signature", () => {
    expect(
      resolvePrivySigningRequest(
        {
          walletId: "wallet-1",
          hash: "0xabc",
          authorizationSignature: "c2lnbmF0dXJl",
        },
        "wallet-1",
        "token-1"
      )
    ).toEqual({
      hash: "0xabc",
      authorizationContext: { signatures: ["c2lnbmF0dXJl"] },
    });
  });

  it("falls back to the exact verified access token", () => {
    expect(
      resolvePrivySigningRequest(
        { walletId: "wallet-1", hash: "0xabc" },
        "wallet-1",
        "token-1"
      )
    ).toEqual({
      hash: "0xabc",
      authorizationContext: { user_jwts: ["token-1"] },
    });
  });
});
