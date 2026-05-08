import { describe, expect, it } from "vitest";
import { normalizeLsTxHash } from "@/bridge/ethereum/layerswap/hashes";

describe("normalizeLsTxHash", () => {
  it("pads short Starknet hashes to 32 bytes", () => {
    const short = "0x3397f2d";
    const padded = normalizeLsTxHash(short, "starknet");
    expect(padded.length).toBe(66); // "0x" + 64 hex chars
    expect(padded.endsWith("3397f2d")).toBe(true);
    expect(padded.startsWith("0x000000")).toBe(true);
  });

  it("leaves already-padded Starknet hashes unchanged in length", () => {
    const full = "0x" + "1".padStart(64, "0");
    expect(normalizeLsTxHash(full, "starknet")).toBe(full);
  });

  it("passes Ethereum hashes through unchanged", () => {
    const hash = "0x" + "ab".repeat(32);
    expect(normalizeLsTxHash(hash, "ethereum")).toBe(hash);
  });

  it("passes Solana base58 signatures through unchanged", () => {
    const sig =
      "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW";
    expect(normalizeLsTxHash(sig, "solana")).toBe(sig);
  });
});
