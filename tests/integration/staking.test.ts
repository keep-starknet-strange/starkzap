import { beforeAll, describe, it } from "vitest";
import { sepoliaTokens, StarkSDK } from "../../src/index.js";
import { testnetConfig } from "../config.js";
import { Address } from "../../src/types/address.js";

describe("Staking", () => {
  let sdk: StarkSDK;

  const sepoliaPoolAddress = Address.from(
    "0x056e375b0554d472f125d5de8f7d20994167d69ec4c5ebf16c5de17cac2818c8"
  );
  const sepoliaStaker = Address.from(
    "0x00eec9c60f18316a9eba3862e923f1cbebc621acaffefc1699c508671974cf7f"
  );
  const STRK = sepoliaTokens.STRK!;

  beforeAll(async () => {
    console.log("Starting staking");

    sdk = new StarkSDK(testnetConfig);
  });

  it("test staking in pool", async () => {
    await sdk.stakingInPool(sepoliaPoolAddress, STRK);
  });

  it("test staking by staker", async () => {
    await sdk.stakingInValidator(sepoliaStaker, STRK);
  });

  it("test active tokens", async () => {
    const tokens = await sdk.stakingTokens();

    console.log(tokens);
  });
});
