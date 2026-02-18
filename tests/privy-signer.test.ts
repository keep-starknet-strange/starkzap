import { describe, expect, it, vi, afterEach } from "vitest";
import { PrivySigner } from "@/signer";

const VALID_SIGNATURE = `0x${"1".repeat(64)}${"2".repeat(64)}`;

describe("PrivySigner", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("should parse valid signatures from rawSign", async () => {
    const signer = new PrivySigner({
      walletId: "wallet-1",
      publicKey: "0xabc",
      rawSign: async () => VALID_SIGNATURE,
    });

    await expect(signer.signRaw("0x123")).resolves.toEqual([
      `0x${"1".repeat(64)}`,
      `0x${"2".repeat(64)}`,
    ]);
  });

  it("should include custom auth headers and payload for serverUrl mode", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ signature: VALID_SIGNATURE }),
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const signer = new PrivySigner({
      walletId: "wallet-1",
      publicKey: "0xabc",
      serverUrl: "https://example.com/sign",
      headers: async () => ({ Authorization: "Bearer token-1" }),
      buildBody: ({ walletId, hash }) => ({
        walletId,
        hash,
        nonce: "nonce-1",
      }),
    });

    await signer.signRaw("0x123");

    expect(fetchMock).toHaveBeenCalledWith("https://example.com/sign", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token-1",
      },
      body: JSON.stringify({
        walletId: "wallet-1",
        hash: "0x123",
        nonce: "nonce-1",
      }),
    });
  });

  it("should reject malformed signature length", async () => {
    const signer = new PrivySigner({
      walletId: "wallet-1",
      publicKey: "0xabc",
      rawSign: async () => "0x1234",
    });

    await expect(signer.signRaw("0x123")).rejects.toThrow(
      "expected a 64-byte signature"
    );
  });

  it("should reject non-hex signatures", async () => {
    const signer = new PrivySigner({
      walletId: "wallet-1",
      publicKey: "0xabc",
      rawSign: async () => `0x${"z".repeat(128)}`,
    });

    await expect(signer.signRaw("0x123")).rejects.toThrow("not valid hex");
  });
});
