import { describe, expect, it } from "vitest";
import { ChainId } from "@/types";
import { ekuboPresets, getEkuboPreset } from "@/swap/ekubo";

describe("Ekubo presets", () => {
  it("resolves the expected preset for each supported chain", () => {
    expect(getEkuboPreset(ChainId.MAINNET)).toEqual(ekuboPresets.SN_MAIN);
    expect(getEkuboPreset(ChainId.SEPOLIA)).toEqual(ekuboPresets.SN_SEPOLIA);
  });

  it("keeps distinct routers per chain", () => {
    expect(ekuboPresets.SN_MAIN.extensionRouter).not.toBe(
      ekuboPresets.SN_SEPOLIA.extensionRouter
    );
  });
});
