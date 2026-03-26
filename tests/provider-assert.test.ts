import { describe, it, expect } from "vitest";
import { assertPreparedCalls } from "@/providers/assert";

describe("assertPreparedCalls", () => {
  it("does not throw when calls array is non-empty", () => {
    const calls = [{ contractAddress: "0x1", entrypoint: "transfer" }];
    expect(() => assertPreparedCalls(calls, "DCA", "avnu")).not.toThrow();
  });

  it("throws when calls array is empty", () => {
    expect(() => assertPreparedCalls([], "lending", "vesu")).toThrow(
      'lending provider "vesu" returned no calls'
    );
  });

  it("includes domain and provider id in the error message", () => {
    expect(() => assertPreparedCalls([], "swap", "ekubo")).toThrow(
      'swap provider "ekubo" returned no calls'
    );
  });
});
