import { describe, expect, it } from "vitest";
import { CallData, uint256 } from "starknet";
import { ChainId, fromAddress } from "@/types";
import { StarkZap } from "@/sdk";
import { StarkSigner } from "@/signer";
import { OpenZeppelinPreset } from "@/account";
import { testnetConfig, testnetFunder, testnetPaymasterConfig } from "./config";
import { sepoliaTokens } from "@/erc20";

const RUN_LIVE_PAYMASTER_TESTS = process.env.RUN_LIVE_PAYMASTER_TESTS === "1";

const maybeDescribe = RUN_LIVE_PAYMASTER_TESTS ? describe : describe.skip;

maybeDescribe("Live Paymaster Smoke (opt-in)", () => {
  it("executes user_pays and sponsored transactions with a StarkZap-created wallet", async () => {
    if (!testnetFunder.privateKey) {
      throw new Error(
        "Missing STARKZAP_TESTNET_FUNDER_PRIVATE_KEY for live paymaster smoke test"
      );
    }

    const sdkUserPays = new StarkZap({
      rpcUrl: testnetConfig.rpcUrl,
      chainId: ChainId.SEPOLIA,
    });
    const userPaysWallet = await sdkUserPays.connectWallet({
      account: {
        signer: new StarkSigner(testnetFunder.privateKey),
        accountClass: OpenZeppelinPreset,
      },
      ...(testnetFunder.address && { accountAddress: testnetFunder.address }),
    });

    if (testnetFunder.address) {
      expect(fromAddress(userPaysWallet.address)).toBe(testnetFunder.address);
    }

    const sdkSponsored = new StarkZap({
      rpcUrl: testnetConfig.rpcUrl,
      chainId: ChainId.SEPOLIA,
      paymaster: testnetPaymasterConfig,
    });
    const sponsoredWallet = await sdkSponsored.connectWallet({
      account: {
        signer: new StarkSigner(testnetFunder.privateKey),
        accountClass: OpenZeppelinPreset,
      },
      ...(testnetFunder.address && { accountAddress: testnetFunder.address }),
      feeMode: { type: "paymaster" },
    });

    expect(sponsoredWallet.address).toBe(userPaysWallet.address);

    // approve(0) is an idempotent, low-impact state-changing call we can use to test both fee paths.
    const approveZeroCall = {
      contractAddress: sepoliaTokens.STRK.address,
      entrypoint: "approve",
      calldata: CallData.compile([
        userPaysWallet.address,
        uint256.bnToUint256(0n),
      ]),
    };

    const userPaysTx = await userPaysWallet.execute([approveZeroCall], {
      feeMode: "user_pays",
    });
    await userPaysTx.wait();

    const sponsoredTx = await sponsoredWallet.execute([approveZeroCall], {
      feeMode: { type: "paymaster" },
    });
    await sponsoredTx.wait();

    expect(userPaysTx.hash).toMatch(/^0x[0-9a-fA-F]+$/);
    expect(sponsoredTx.hash).toMatch(/^0x[0-9a-fA-F]+$/);
  }, 180_000);
});
