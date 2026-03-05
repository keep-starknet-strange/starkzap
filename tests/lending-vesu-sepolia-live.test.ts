import { describe, expect, it } from "vitest";
import { Amount, ChainId, fromAddress } from "@/types";
import { StarkZap } from "@/sdk";
import { StarkSigner } from "@/signer";
import { sepoliaTokens } from "@/erc20";
import { VesuLendingProvider, vesuPresets } from "@/lending/vesu";
import { testnetConfig, testnetFunder } from "./config";

const RUN_LIVE_VESU_SEPOLIA_TESTS =
  process.env.RUN_LIVE_VESU_SEPOLIA_TESTS === "1";

const maybeDescribe = RUN_LIVE_VESU_SEPOLIA_TESTS ? describe : describe.skip;

const SEPOLIA_POOL = vesuPresets.SN_SEPOLIA.defaultPool!;
const SEPOLIA_POOL_FACTORY =
  process.env.STARKZAP_VESU_SEPOLIA_POOL_FACTORY?.trim().toLowerCase();

function createSepoliaProvider() {
  return new VesuLendingProvider({
    chainConfigs: {
      SN_SEPOLIA: {
        defaultPool: SEPOLIA_POOL,
        ...(SEPOLIA_POOL_FACTORY
          ? { poolFactory: fromAddress(SEPOLIA_POOL_FACTORY) }
          : {}),
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

async function ensureUsdcBuffer(
  wallet: Awaited<ReturnType<typeof createWallet>>,
  minUsdcBase: bigint
) {
  const usdc = sepoliaTokens.USDC;
  let usdcBalance = (await wallet.balanceOf(usdc)).toBase();
  if (usdcBalance >= minUsdcBase) {
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
  await tx.wait();

  usdcBalance = (await wallet.balanceOf(usdc)).toBase();
  if (usdcBalance < minUsdcBase) {
    throw new Error(
      `Insufficient USDC buffer after swap: got ${usdcBalance.toString()}, need ${minUsdcBase.toString()}`
    );
  }
  return usdcBalance;
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
    await supplyTx.wait();

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
    await withdrawTx.wait();

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
    const borrowTx = await lending.borrow(borrowRequest, {
      feeMode: "user_pays",
    });
    await borrowTx.wait();

    const postBorrowPosition = await lending.getPosition(healthRequest);
    expect((postBorrowPosition.debtAmount ?? 0n) > 0n).toBe(true);

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
    const repayTx = await lending.repay(repayRequest, { feeMode: "user_pays" });
    await repayTx.wait();

    const finalPosition = await lending.getPosition(healthRequest);
    expect(finalPosition.debtAmount ?? 0n).toBe(0n);
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
      await depositTx.wait();

      const withdrawTx = await lending.withdraw(
        {
          provider,
          token,
          amount: Amount.parse("0.5", token),
        },
        { feeMode: "user_pays" }
      );
      await withdrawTx.wait();

      const withdrawMaxTx = await lending.withdrawMax(
        {
          provider,
          token,
        },
        { feeMode: "user_pays" }
      );
      await withdrawMaxTx.wait();
    },
    420_000
  );
});
