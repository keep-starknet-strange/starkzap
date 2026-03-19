import { describe, expect, it } from "vitest";
import { Amount, ChainId } from "@/types";
import { StarkZap } from "@/sdk";
import { StarkSigner } from "@/signer";
import { OpenZeppelinPreset } from "@/account";
import { EkuboDcaProvider } from "@/dca";
import { sepoliaTokens } from "@/erc20";
import type { PreparedDcaAction } from "@/dca";
import type { Tx } from "@/tx";
import { testnetConfig, testnetFunder } from "./config";

const RUN_LIVE_DCA_SEPOLIA_TESTS =
  process.env.RUN_LIVE_DCA_SEPOLIA_TESTS === "1";

const maybeDescribe = RUN_LIVE_DCA_SEPOLIA_TESTS ? describe : describe.skip;

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function createLiveWallet() {
  if (!testnetFunder.privateKey) {
    throw new Error(
      "Missing STARKZAP_TESTNET_FUNDER_PRIVATE_KEY for live Ekubo DCA Sepolia smoke test"
    );
  }

  const sdk = new StarkZap({
    rpcUrl: testnetConfig.rpcUrl,
    chainId: ChainId.SEPOLIA,
  });

  return await sdk.connectWallet({
    account: {
      signer: new StarkSigner(testnetFunder.privateKey),
      accountClass: OpenZeppelinPreset,
    },
    ...(testnetFunder.address && { accountAddress: testnetFunder.address }),
  });
}

async function prepareDcaWithLogs(
  wallet: Awaited<ReturnType<typeof createLiveWallet>>,
  provider: EkuboDcaProvider
): Promise<PreparedDcaAction> {
  console.log("Preparing Ekubo DCA create on Sepolia...");
  return await wallet.dca().prepareCreate({
    provider,
    sellToken: sepoliaTokens.STRK,
    buyToken: sepoliaTokens.ETH,
    sellAmount: Amount.parse("10", sepoliaTokens.STRK),
    sellAmountPerCycle: Amount.parse("5", sepoliaTokens.STRK),
    frequency: "PT1H",
  });
}

async function submitPreparedDca(
  wallet: Awaited<ReturnType<typeof createLiveWallet>>,
  prepared: PreparedDcaAction
): Promise<Tx> {
  console.log(
    `Submitting ${prepared.calls.length} prepared Ekubo DCA call(s) in user_pays mode...`
  );
  return await wallet.execute(prepared.calls, { feeMode: "user_pays" });
}

maybeDescribe("Live Ekubo DCA Sepolia Smoke (opt-in)", () => {
  it("prepares and tries to submit an Ekubo DCA order on Sepolia", async () => {
    const wallet = await createLiveWallet();

    console.log(`Wallet: ${wallet.address}`);
    console.log(`RPC: ${testnetConfig.rpcUrl}`);

    const deployed = await wallet.isDeployed();
    console.log(`Deployed: ${deployed ? "yes" : "no"}`);

    const strkBalance = await wallet.balanceOf(sepoliaTokens.STRK);
    console.log(
      `STRK balance: ${strkBalance.toUnit()} (${strkBalance.toBase().toString()} base units)`
    );

    const provider = new EkuboDcaProvider();
    let prepared: PreparedDcaAction;
    try {
      prepared = await prepareDcaWithLogs(wallet, provider);
    } catch (error) {
      throw new Error(
        `Ekubo DCA prepare failed for ${wallet.address}: ${describeError(error)}`
      );
    }

    expect(prepared.calls.length).toBeGreaterThan(0);
    console.log(
      `Prepared calls: ${prepared.calls.map((call) => call.entrypoint).join(", ")}`
    );

    const preflight = await wallet.preflight({
      calls: prepared.calls,
      feeMode: "user_pays",
    });
    console.log(
      `Preflight: ${preflight.ok ? "ok" : `failed (${preflight.reason})`}`
    );

    let tx: Tx;
    try {
      tx = await submitPreparedDca(wallet, prepared);
    } catch (error) {
      throw new Error(
        `Ekubo DCA submit failed for ${wallet.address}: ${describeError(error)}`
      );
    }

    expect(tx.hash).toMatch(/^0x[0-9a-fA-F]+$/);
    console.log(`DCA tx: ${tx.hash}`);
    console.log(`DCA explorer: ${tx.explorerUrl}`);

    try {
      await tx.wait();
    } catch (error) {
      throw new Error(
        `Ekubo DCA confirmation failed for ${wallet.address}: ${describeError(error)}`
      );
    }

    console.log("DCA transaction confirmed");

    try {
      const orders = await wallet.dca().getOrders({
        provider,
        size: 5,
      });
      console.log(
        `Fetched ${orders.content.length} Ekubo order(s) after submit`
      );
      if (orders.content[0]) {
        console.log(
          `Latest order status: ${orders.content[0].status}, executed=${orders.content[0].executedTradesCount ?? 0}, pending=${orders.content[0].pendingTradesCount ?? 0}`
        );
      }
    } catch (error) {
      console.warn(
        `Ekubo DCA order refresh after submit failed: ${describeError(error)}`
      );
    }
  }, 300_000);
});
