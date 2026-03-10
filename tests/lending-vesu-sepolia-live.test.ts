import { describe, expect, it } from "vitest";
import { Amount, ChainId, fromAddress } from "@/types";
import { StarkZap } from "@/sdk";
import { StarkSigner } from "@/signer";
import { sepoliaTokens } from "@/erc20";
import type { LendingClient } from "@/lending";
import { VesuLendingProvider, vesuPresets } from "@/lending/vesu";
import type { Tx } from "@/tx";
import { testnetConfig, testnetFunder } from "./config";

const RUN_LIVE_VESU_SEPOLIA_TESTS =
  process.env.RUN_LIVE_VESU_SEPOLIA_TESTS === "1";

const maybeDescribe = RUN_LIVE_VESU_SEPOLIA_TESTS ? describe : describe.skip;

const SEPOLIA_POOL = vesuPresets.SN_SEPOLIA.defaultPool!;
const SEPOLIA_POOL_FACTORY =
  process.env.STARKZAP_VESU_SEPOLIA_POOL_FACTORY?.trim()
    ? fromAddress(process.env.STARKZAP_VESU_SEPOLIA_POOL_FACTORY.trim())
    : vesuPresets.SN_SEPOLIA.poolFactory;

function createSepoliaProvider() {
  return new VesuLendingProvider({
    chainConfigs: {
      SN_SEPOLIA: {
        defaultPool: SEPOLIA_POOL,
        ...(SEPOLIA_POOL_FACTORY ? { poolFactory: SEPOLIA_POOL_FACTORY } : {}),
      },
    },
  });
}

async function createWallet() {
  if (!testnetFunder.privateKey) {
    throw new Error(
      "Missing STARKZAP_TESTNET_FUNDER_PRIVATE_KEY for live Vesu Sepolia e2e"
    );
  }

  const sdk = new StarkZap({
    rpcUrl: testnetConfig.rpcUrl,
    chainId: ChainId.SEPOLIA,
  });

  return await sdk.connectWallet({
    account: { signer: new StarkSigner(testnetFunder.privateKey) },
    ...(testnetFunder.address && { accountAddress: testnetFunder.address }),
  });
}

async function waitAndLogTx(label: string, tx: Tx) {
  console.log(`${label} tx: ${tx.hash}`);
  console.log(`${label} explorer: ${tx.explorerUrl}`);
  await tx.wait();
  console.log(`${label} confirmed`);
}

async function ensureUsdcBuffer(
  wallet: Awaited<ReturnType<typeof createWallet>>,
  minUsdcBase: bigint
) {
  const usdc = sepoliaTokens.USDC;
  let usdcBalance = (await wallet.balanceOf(usdc)).toBase();
  if (usdcBalance >= minUsdcBase) {
    console.log(
      `USDC buffer already available: ${usdcBalance.toString()} base units`
    );
    return usdcBalance;
  }

  const swapAmountIn = Amount.parse("1", sepoliaTokens.STRK);
  const quote = await wallet.getQuote({
    tokenIn: sepoliaTokens.STRK,
    tokenOut: usdc,
    amountIn: swapAmountIn,
  });
  if (quote.amountOutBase <= 0n) {
    throw new Error("AVNU returned zero output for STRK -> USDC buffer swap");
  }

  const tx = await wallet.swap(
    {
      tokenIn: sepoliaTokens.STRK,
      tokenOut: usdc,
      amountIn: swapAmountIn,
    },
    { feeMode: "user_pays" }
  );
  await waitAndLogTx("USDC buffer swap", tx);

  usdcBalance = (await wallet.balanceOf(usdc)).toBase();
  if (usdcBalance < minUsdcBase) {
    throw new Error(
      `Insufficient USDC buffer after swap: got ${usdcBalance.toString()}, need ${minUsdcBase.toString()}`
    );
  }
  return usdcBalance;
}

async function cleanupBorrowLifecycle(
  lending: LendingClient,
  healthRequest: {
    provider: VesuLendingProvider;
    collateralToken: typeof sepoliaTokens.STRK;
    debtToken: typeof sepoliaTokens.USDC;
  },
  repayRequest: {
    provider: VesuLendingProvider;
    collateralToken: typeof sepoliaTokens.STRK;
    debtToken: typeof sepoliaTokens.USDC;
    amount: Amount;
    collateralAmount: Amount;
    withdrawCollateral: true;
  }
) {
  try {
    const position = await lending.getPosition(healthRequest);
    if ((position.debtAmount ?? 0n) === 0n) {
      return;
    }
    const tx = await lending.repay(repayRequest, { feeMode: "user_pays" });
    await waitAndLogTx("Borrow lifecycle cleanup", tx);
  } catch (error) {
    console.error("Borrow lifecycle cleanup failed", error);
  }
}

maybeDescribe("Live Vesu Sepolia E2E (opt-in)", () => {
  it("runs supply-like, withdraw-like, borrow, and repay lifecycle on Sepolia", async () => {
    const wallet = await createWallet();
    const provider = createSepoliaProvider();
    const lending = wallet.lending();

    const STRK = sepoliaTokens.STRK;
    const USDC = sepoliaTokens.USDC;

    const healthRequest = {
      provider,
      collateralToken: STRK,
      debtToken: USDC,
    } as const;

    const baselinePosition = await lending.getPosition(healthRequest);
    if ((baselinePosition.debtAmount ?? 0n) !== 0n) {
      throw new Error(
        `Expected zero starting debt for deterministic e2e, found ${baselinePosition.debtAmount?.toString() ?? "0"}`
      );
    }

    const minUsdcBuffer = Amount.parse("0.00001", USDC).toBase();
    await ensureUsdcBuffer(wallet, minUsdcBuffer);

    const supplyOnlyRequest = {
      provider,
      collateralToken: STRK,
      debtToken: USDC,
      collateralAmount: Amount.parse("5", STRK),
      amount: Amount.parse("0", USDC),
    } as const;

    const supplyQuote = await lending.quoteHealth({
      action: { action: "borrow", request: supplyOnlyRequest },
      health: healthRequest,
      feeMode: "user_pays",
    });
    expect(supplyQuote.simulation.ok).toBe(true);
    const supplyTx = await lending.borrow(supplyOnlyRequest, {
      feeMode: "user_pays",
    });
    await waitAndLogTx("Supply-like collateral add", supplyTx);

    const withdrawOnlyRequest = {
      provider,
      collateralToken: STRK,
      debtToken: USDC,
      amount: Amount.parse("0", USDC),
      collateralAmount: Amount.parse("5", STRK),
      withdrawCollateral: true,
    } as const;

    const withdrawQuote = await lending.quoteHealth({
      action: { action: "repay", request: withdrawOnlyRequest },
      health: healthRequest,
      feeMode: "user_pays",
    });
    expect(withdrawQuote.simulation.ok).toBe(true);
    const withdrawTx = await lending.repay(withdrawOnlyRequest, {
      feeMode: "user_pays",
    });
    await waitAndLogTx("Withdraw-like collateral remove", withdrawTx);

    const borrowRequest = {
      provider,
      collateralToken: STRK,
      debtToken: USDC,
      collateralAmount: Amount.parse("20", STRK),
      amount: Amount.parse("0.1", USDC),
    } as const;

    const borrowQuote = await lending.quoteHealth({
      action: { action: "borrow", request: borrowRequest },
      health: healthRequest,
      feeMode: "user_pays",
    });
    expect(borrowQuote.simulation.ok).toBe(true);
    expect(borrowQuote.projected).not.toBeNull();
    const repayRequest = {
      provider,
      collateralToken: STRK,
      debtToken: USDC,
      amount: Amount.parse("0.10001", USDC),
      collateralAmount: Amount.parse("20", STRK),
      withdrawCollateral: true,
    } as const;

    const repayQuote = await lending.quoteHealth({
      action: { action: "repay", request: repayRequest },
      health: healthRequest,
      feeMode: "user_pays",
    });
    expect(repayQuote.simulation.ok).toBe(true);
    try {
      const borrowTx = await lending.borrow(borrowRequest, {
        feeMode: "user_pays",
      });
      await waitAndLogTx("Borrow lifecycle open", borrowTx);

      const postBorrowPosition = await lending.getPosition(healthRequest);
      expect((postBorrowPosition.debtAmount ?? 0n) > 0n).toBe(true);

      const repayTx = await lending.repay(repayRequest, {
        feeMode: "user_pays",
      });
      await waitAndLogTx("Borrow lifecycle close", repayTx);

      const finalPosition = await lending.getPosition(healthRequest);
      expect(finalPosition.debtAmount ?? 0n).toBe(0n);
    } finally {
      await cleanupBorrowLifecycle(lending, healthRequest, repayRequest);
    }
  }, 420_000);

  const maybeItWithPoolFactory = SEPOLIA_POOL_FACTORY ? it : it.skip;
  maybeItWithPoolFactory(
    "runs deposit, withdraw amount, and withdrawMax when poolFactory is configured",
    async () => {
      const wallet = await createWallet();
      const provider = createSepoliaProvider();
      const lending = wallet.lending();

      const token = sepoliaTokens.STRK;

      const depositTx = await lending.deposit(
        {
          provider,
          token,
          amount: Amount.parse("1", token),
        },
        { feeMode: "user_pays" }
      );
      await waitAndLogTx("Deposit", depositTx);

      const withdrawTx = await lending.withdraw(
        {
          provider,
          token,
          amount: Amount.parse("0.5", token),
        },
        { feeMode: "user_pays" }
      );
      await waitAndLogTx("Withdraw partial", withdrawTx);

      const withdrawMaxTx = await lending.withdrawMax(
        {
          provider,
          token,
        },
        { feeMode: "user_pays" }
      );
      await waitAndLogTx("Withdraw max", withdrawMaxTx);
    },
    420_000
  );
});
