import { describe, expect, it } from "vitest";
import { StarkSDK } from "@/sdk";
import { getStakingPreset } from "@/staking";
import { ChainId, fromAddress } from "@/types";

describe("staking presets", () => {
  it("should return mainnet staking preset", () => {
    const preset = getStakingPreset(ChainId.MAINNET);
    expect(preset.contract).toBe(
      fromAddress(
        "0x00ca1702e64c81d9a07b86bd2c540188d92a2c73cf5cc0e508d949015e7e84a7"
      )
    );
  });

  it("should return sepolia staking preset", () => {
    const preset = getStakingPreset(ChainId.SEPOLIA);
    expect(preset.contract).toBe(
      fromAddress(
        "0x03745ab04a431fc02871a139be6b93d9260b0ff3e779ad9c8b377183b23109f1"
      )
    );
  });

  it("should use staking preset by default in sdk config", () => {
    const sdk = new StarkSDK({ network: "sepolia" });
    const resolved = (
      sdk as unknown as { config: { staking: { contract: string } } }
    ).config;
    expect(resolved.staking.contract).toBe(
      fromAddress(
        "0x03745ab04a431fc02871a139be6b93d9260b0ff3e779ad9c8b377183b23109f1"
      )
    );
  });

  it("should prefer explicit staking override over preset", () => {
    const customContract = fromAddress(
      "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    );
    const sdk = new StarkSDK({
      network: "sepolia",
      staking: { contract: customContract },
    });
    const resolved = (
      sdk as unknown as { config: { staking: { contract: string } } }
    ).config;
    expect(resolved.staking.contract).toBe(customContract);
  });
});
