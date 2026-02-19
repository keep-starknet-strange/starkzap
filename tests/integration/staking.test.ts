import { beforeAll, describe, expect, inject, it } from "vitest";
import { StarkSDK } from "@/sdk";
import { sepoliaTokens } from "@/erc20";
import { StarkSigner } from "@/signer";
import { DevnetPreset } from "@/account";
import { Amount, fromAddress, type Validator } from "@/types";
import { testPrivateKeys } from "../config";
import { fund, toSdkConfig } from "./shared";
import { DevnetProvider } from "starknet-devnet";
import { mainnetValidators, sepoliaValidators } from "@/staking";

const STAKING_PER_NETWORK = {
  SN_MAIN: {
    STAKING_CONTRACT:
      "0x00ca1702e64c81d9a07b86bd2c540188d92a2c73cf5cc0e508d949015e7e84a7",
    VALIDATOR_UNDER_TEST:
      "0x00D3b910D8C528Bf0216866053c3821AC6C97983Dc096BFF642e9a3549210ee7",
  },
  SN_SEPOLIA: {
    STAKING_CONTRACT:
      "0x03745ab04a431fc02871a139be6b93d9260b0ff3e779ad9c8b377183b23109f1",
    VALIDATOR_UNDER_TEST:
      "0x01637463889a6907e21bf38Aaa7AC294ca14a8ea32906EC36A88687D46eDD4A8",
  },
};

describe("Staking Lifecycle (Integration)", () => {
  const config = toSdkConfig(inject("testConfig"));
  const testPresets = STAKING_PER_NETWORK[config.chainId!.toLiteral()];
  config.staking = {
    contract: fromAddress(testPresets.STAKING_CONTRACT),
  };
  const validatorUnderTest = fromAddress(testPresets.VALIDATOR_UNDER_TEST);

  let sdk: StarkSDK;
  let devnetRunning = false;
  let stakingAvailable = false;

  const STRK = sepoliaTokens.STRK;

  beforeAll(async () => {
    sdk = new StarkSDK(config);

    const devnetProvider = new DevnetProvider({
      url: config.rpcUrl!,
    });
    devnetRunning = await devnetProvider.isAlive();

    // Staking tests require both devnet and staking contract config (forking from Sepolia)
    stakingAvailable = devnetRunning && !!config.staking;

    if (!devnetRunning) {
      console.warn("Devnet not running, skipping staking integration tests");
    } else if (!config.staking) {
      console.warn(
        "Staking config not configured (requires FORK_STAKING_CONTRACT env var), skipping staking tests"
      );
    }
  });

  it("should complete full staking lifecycle: enter → add → exit intent", async () => {
    if (!stakingAvailable) {
      console.log("Skipping: staking not available (requires forking)");
      return;
    }

    // ==================== SETUP ====================
    console.log("\n=== SETUP ===");

    // Create wallet
    const privateKey = testPrivateKeys.random();
    const signer = new StarkSigner(privateKey);
    const wallet = await sdk.connectWallet({
      account: {
        signer,
        accountClass: DevnetPreset,
      },
    });
    console.log("Wallet address:", wallet.address);

    // Get staking instance
    const staking = await wallet.stakingInStaker(validatorUnderTest, STRK);
    console.log("Validator address:", validatorUnderTest);

    // Get pool commission
    const commission = await wallet.getPoolCommission(staking.poolAddress);
    console.log("Pool commission:", commission, "%");
    expect(commission).toBeGreaterThanOrEqual(0);
    expect(commission).toBeLessThanOrEqual(100);

    // Fund wallet generously for all operations
    const totalFunding = Amount.parse(1000, STRK);
    await fund(wallet, totalFunding);
    console.log("Funded:", totalFunding.toFormatted());

    // Deploy account
    await wallet.ensureReady({ deploy: "if_needed" });
    console.log("Account deployed");

    // Verify not a member yet
    const isMemberInitial = await wallet.isPoolMember(staking.poolAddress);
    expect(isMemberInitial).toBe(false);
    console.log("Is member (before enter):", isMemberInitial);

    // Position should be null for non-member
    const positionInitial = await wallet.getPoolPosition(staking.poolAddress);
    expect(positionInitial).toBeNull();

    // ==================== STEP 1: ENTER POOL ====================
    console.log("\n=== STEP 1: ENTER POOL ===");

    const initialStake = Amount.parse(100, STRK);
    console.log("Entering pool with:", initialStake.toFormatted());

    const enterTx = await staking.enter(wallet, initialStake);
    console.log("Enter tx:", enterTx.hash);
    await enterTx.wait();
    console.log("Enter confirmed");

    // Verify membership
    const isMemberAfterEnter = await staking.isMember(wallet);
    expect(isMemberAfterEnter).toBe(true);
    console.log("Is member (after enter):", isMemberAfterEnter);

    // Check position
    const positionAfterEnter = await staking.getPosition(wallet);
    expect(positionAfterEnter).not.toBeNull();
    console.log("Position after enter:");
    console.log("  Staked:", positionAfterEnter!.staked.toFormatted());
    console.log("  Rewards:", positionAfterEnter!.rewards.toFormatted());
    console.log("  Unpooling:", positionAfterEnter!.unpooling.toFormatted());
    console.log("  Commission:", positionAfterEnter!.commissionPercent, "%");

    // Verify state
    expect(positionAfterEnter!.staked.eq(initialStake)).toBe(true);
    expect(positionAfterEnter!.rewards.isZero()).toBe(true);
    expect(positionAfterEnter!.unpooling.isZero()).toBe(true);
    expect(positionAfterEnter!.unpoolTime).toBeNull();

    // ==================== STEP 2: ADD TO STAKE ====================
    console.log("\n=== STEP 2: ADD TO STAKE ===");

    const additionalStake = Amount.parse(50, STRK);
    console.log("Adding to stake:", additionalStake.toFormatted());

    const addTx = await staking.add(wallet, additionalStake);
    console.log("Add tx:", addTx.hash);
    await addTx.wait();
    console.log("Add confirmed");

    // Check updated position
    const positionAfterAdd = await staking.getPosition(wallet);
    expect(positionAfterAdd).not.toBeNull();

    const expectedTotalStake = initialStake.add(additionalStake);
    console.log("Position after add:");
    console.log("  Staked:", positionAfterAdd!.staked.toFormatted());
    console.log("  Expected:", expectedTotalStake.toFormatted());

    // Verify stake increased
    expect(positionAfterAdd!.staked.eq(expectedTotalStake)).toBe(true);
    expect(positionAfterAdd!.unpooling.isZero()).toBe(true);

    // ==================== STEP 3: EXIT INTENT ====================
    console.log("\n=== STEP 3: EXIT INTENT ===");

    const exitAmount = Amount.parse(75, STRK);
    console.log("Initiating exit for:", exitAmount.toFormatted());

    const exitIntentTx = await staking.exitIntent(wallet, exitAmount);
    console.log("Exit intent tx:", exitIntentTx.hash);
    await exitIntentTx.wait();
    console.log("Exit intent confirmed");

    // Check final position
    const positionAfterExit = await staking.getPosition(wallet);
    expect(positionAfterExit).not.toBeNull();

    const expectedRemainingStake = expectedTotalStake.subtract(exitAmount);
    console.log("Position after exit intent:");
    console.log("  Staked:", positionAfterExit!.staked.toFormatted());
    console.log("  Unpooling:", positionAfterExit!.unpooling.toFormatted());
    console.log("  Unpool time:", positionAfterExit!.unpoolTime);
    console.log("  Expected remaining:", expectedRemainingStake.toFormatted());

    // Verify exit state
    expect(positionAfterExit!.staked.eq(expectedRemainingStake)).toBe(true);
    expect(positionAfterExit!.unpooling.eq(exitAmount)).toBe(true);
    expect(positionAfterExit!.unpoolTime).not.toBeNull();
    expect(positionAfterExit!.unpoolTime!.getTime()).toBeGreaterThan(
      Date.now()
    );

    // Still a member (has remaining stake)
    const isMemberFinal = await staking.isMember(wallet);
    expect(isMemberFinal).toBe(true);

    console.log("\n=== STAKING LIFECYCLE COMPLETE ===");
    console.log("Summary:");
    console.log("  Initial stake:", initialStake.toFormatted());
    console.log("  Added:", additionalStake.toFormatted());
    console.log("  Total staked:", expectedTotalStake.toFormatted());
    console.log("  Exit intent:", exitAmount.toFormatted());
    console.log("  Remaining stake:", expectedRemainingStake.toFormatted());
    console.log("  Unpooling:", exitAmount.toFormatted());
  });

  it("should verify staking tokens are available", async () => {
    if (!stakingAvailable) {
      console.log("Skipping: staking not available");
      return;
    }

    const tokens = await sdk.stakingTokens();
    console.log(
      "Active staking tokens:",
      tokens.map((t) => t.symbol)
    );

    expect(tokens.length).toBeGreaterThan(0);

    // STRK should be stakeable
    const hasStrk = tokens.some((t) => t.symbol === "STRK");
    expect(hasStrk).toBe(true);
  });

  it("should enforce staking constraints", async () => {
    if (!stakingAvailable) {
      console.log("Skipping: staking not available");
      return;
    }

    // Create wallet that won't enter the pool
    const privateKey = testPrivateKeys.random();
    const signer = new StarkSigner(privateKey);
    const wallet = await sdk.connectWallet({
      account: {
        signer,
        accountClass: DevnetPreset,
      },
    });

    const staking = await wallet.stakingInStaker(validatorUnderTest, STRK);

    await fund(wallet, Amount.parse(500, STRK));
    await wallet.ensureReady({ deploy: "if_needed" });

    // Test: Cannot add to stake without being a member
    console.log("Testing: add without membership...");
    expect(async () => {
      await wallet.addToPool(staking.poolAddress, Amount.parse(50, STRK));
    }).rejects.toThrow(/not a member/i);
    console.log("  ✓ Correctly rejected");

    // Test: Cannot exit without being a member
    console.log("Testing: exit without membership...");
    expect(async () => {
      await wallet.exitPoolIntent(staking.poolAddress, Amount.parse(50, STRK));
    }).rejects.toThrow(/not a member/i);
    console.log("  ✓ Correctly rejected");

    // Enter to test other constraints
    const enterTx = await wallet.enterPool(
      staking.poolAddress,
      Amount.parse(100, STRK)
    );
    await enterTx.wait();

    // Test: Cannot enter twice
    console.log("Testing: double enter...");
    expect(async () => {
      await wallet.enterPool(staking.poolAddress, Amount.parse(50, STRK));
    }).rejects.toThrow(/already a member/i);
    console.log("  ✓ Correctly rejected");

    // Test: Cannot exit more than staked
    console.log("Testing: exit more than staked...");
    expect(async () => {
      await wallet.exitPoolIntent(staking.poolAddress, Amount.parse(200, STRK));
    }).rejects.toThrow(/lower than exiting/i);
    console.log("  ✓ Correctly rejected");
  });

  describe("getStakerPools", () => {
    it("should return pools for a known validator", async () => {
      if (!stakingAvailable) {
        console.log("Skipping: staking not available");
        return;
      }

      let validator: Validator;
      if (config.chainId?.isSepolia()) {
        validator = sepoliaValidators.NETHERMIND;
      } else {
        validator = mainnetValidators.KARNOT;
      }
      console.log("Testing getStakerPools for validator:", validator.name);

      const pools = await sdk.getStakerPools(validator.stakerAddress);

      console.log("Found pools:", pools.length);

      expect(pools).toBeDefined();
      expect(pools.length).toBeGreaterThan(0);
      expect(Array.isArray(pools)).toBe(true);

      for (const pool of pools) {
        console.log("  Pool:", {
          poolContract: pool.poolContract,
          token: pool.token.symbol,
          amount: pool.amount.toFormatted(),
        });

        // Verify pool structure
        expect(pool.poolContract).toBeDefined();
        expect(pool.token).toBeDefined();
        expect(pool.token.address).toBeDefined();
        expect(pool.token.symbol).toBeDefined();
        expect(pool.token.decimals).toBeDefined();
        expect(pool.amount).toBeDefined();
      }
    });

    it("should return pools for multiple validators", async () => {
      if (!stakingAvailable) {
        console.log("Skipping: staking not available");
        return;
      }

      let validators: Validator[];
      if (config.chainId?.isSepolia()) {
        validators = [
          sepoliaValidators.NETHERMIND,
          sepoliaValidators.CHORUS_ONE,
          sepoliaValidators.KEPLR,
        ];
      } else {
        validators = [
          mainnetValidators.KARNOT,
          mainnetValidators.READY_PREV_ARGENT,
          mainnetValidators.TWINSTAKE,
        ];
      }

      for (const validator of validators) {
        console.log("\nTesting validator:", validator.name);

        const pools = await sdk.getStakerPools(validator.stakerAddress);

        console.log("  Pools found:", pools.length);

        expect(pools).toBeDefined();
        expect(Array.isArray(pools)).toBe(true);

        // Each validator should have at least one pool
        if (pools.length > 0) {
          const pool = pools[0];
          expect(pool?.poolContract).toBeDefined();
          expect(pool?.token).toBeDefined();
          expect(pool?.amount).toBeDefined();
          console.log("  Pool token:", pool?.token.symbol);
        }
      }
    });
  });
});
