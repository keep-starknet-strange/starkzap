import { describe, expect, it, vi } from "vitest";

// Simulate @fatsolutions/tongo-sdk not being installed: resolving the optional
// peer dependency rejects, which loadTongoSdk should translate into an
// actionable install hint. This file is isolated so the loader's module cache
// is fresh — and importing the barrel here also proves the rest of the SDK
// stays importable without tongo installed.
vi.mock("@fatsolutions/tongo-sdk", () => {
  throw new Error("Cannot find package '@fatsolutions/tongo-sdk'");
});

import { TongoConfidential } from "@/confidential";

describe("tongo optional peer dependency", () => {
  it("surfaces an install hint when @fatsolutions/tongo-sdk is missing", async () => {
    await expect(
      TongoConfidential.create({
        privateKey: 123n,
        contractAddress: "0xTONGO" as never,
        provider: {} as never,
      })
    ).rejects.toThrow(
      '[starkzap] Tongo confidential transfers requires optional peer dependency "@fatsolutions/tongo-sdk". Install it with: npm i @fatsolutions/tongo-sdk.'
    );
  });
});
