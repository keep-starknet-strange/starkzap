import { beforeAll, describe, expect, inject, it } from "vitest";
import { StarkSDK } from "@/sdk";
import { sepoliaTokens } from "@/erc20";
import { StarkSigner } from "@/signer";
import { DevnetPreset } from "@/account";
import { Amount } from "@/types";
import { testPrivateKeys } from "../config";
import { fund } from "./shared";
import { DevnetProvider } from "starknet-devnet";

describe("ERC20 (Integration)", () => {
  const config = inject("sdkConfig");
  let sdk: StarkSDK;
  let devnetRunning = false;

  const ETH = sepoliaTokens.ETH;
  const STRK = sepoliaTokens.STRK;

  beforeAll(async () => {
    sdk = new StarkSDK(config);

    const devnetProvider = new DevnetProvider({
      url: config.rpcUrl,
    });
    devnetRunning = await devnetProvider.isAlive();

    if (!devnetRunning) {
      console.warn("Devnet not running, skipping integration tests");
    }
  });

  it("should transfer ETH tokens between accounts", async () => {
    if (!devnetRunning) {
      console.log("Skipping: devnet not running");
      return;
    }

    // Create sender wallet
    const senderKey = testPrivateKeys.random();
    const senderSigner = new StarkSigner(senderKey);
    const senderWallet = await sdk.connectWallet({
      account: {
        signer: senderSigner,
        accountClass: DevnetPreset,
      },
    });

    // Create receiver wallet
    const receiverKey = testPrivateKeys.random();
    const receiverSigner = new StarkSigner(receiverKey);
    const receiverWallet = await sdk.connectWallet({
      account: {
        signer: receiverSigner,
        accountClass: DevnetPreset,
      },
    });

    console.log("Sender address:", senderWallet.address);
    console.log("Receiver address:", receiverWallet.address);

    // Fund both accounts
    // - STRK (FRI) for gas fees
    // - ETH (WEI) for the actual ERC20 transfer test
    await fund(senderWallet, Amount.parse(2, STRK));
    await fund(senderWallet, Amount.parse(2, ETH));
    await fund(receiverWallet, Amount.parse(0.1, STRK)); // STRK for deployment
    console.log("Accounts funded");

    // Deploy sender account
    await senderWallet.ensureReady({ deploy: "if_needed" });
    console.log("Sender deployed");

    // Get initial balances using erc20.balanceOf() - now returns Amount
    const senderBalanceBefore = await senderWallet.balanceOf(ETH);
    const receiverBalanceBefore = await receiverWallet.balanceOf(ETH);
    console.log("Sender balance before:", senderBalanceBefore.toFormatted());
    console.log(
      "Receiver balance before:",
      receiverBalanceBefore.toFormatted()
    );

    // Transfer amount: 0.1 ETH using Amount
    const transferAmount = Amount.parse("0.1", ETH);

    // Transfer tokens
    const tx = await senderWallet.transfer(ETH, [
      { to: receiverWallet.address, amount: transferAmount },
    ]);

    console.log("Transfer tx:", tx.hash);

    // Wait for transaction
    await tx.wait();
    console.log("Transfer confirmed");

    // Get final balances using erc20.balanceOf() - now returns Amount
    const senderBalanceAfter = await senderWallet.balanceOf(ETH);
    const receiverBalanceAfter = await receiverWallet.balanceOf(ETH);

    console.log("Sender balance after:", senderBalanceAfter.toFormatted());
    console.log("Receiver balance after:", receiverBalanceAfter.toFormatted());

    // Verify receiver got the tokens using Amount methods
    const receiverGained = receiverBalanceAfter.subtract(receiverBalanceBefore);
    expect(receiverGained.eq(transferAmount)).toBe(true);

    // Verify sender lost at least the transfer amount (plus some gas)
    const senderLost = senderBalanceBefore.subtract(senderBalanceAfter);
    expect(senderLost.gte(transferAmount)).toBe(true);
  });

  it("should transfer to multiple recipients in one transaction", async () => {
    if (!devnetRunning) {
      console.log("Skipping: devnet not running");
      return;
    }

    // Create sender wallet
    const senderKey = testPrivateKeys.random();
    const senderSigner = new StarkSigner(senderKey);
    const senderWallet = await sdk.connectWallet({
      account: {
        signer: senderSigner,
        accountClass: DevnetPreset,
      },
    });

    // Create two receiver wallets
    const receiver1Key = testPrivateKeys.random();
    const receiver1Wallet = await sdk.connectWallet({
      account: {
        signer: new StarkSigner(receiver1Key),
        accountClass: DevnetPreset,
      },
    });

    const receiver2Key = testPrivateKeys.random();
    const receiver2Wallet = await sdk.connectWallet({
      account: {
        signer: new StarkSigner(receiver2Key),
        accountClass: DevnetPreset,
      },
    });

    console.log("Sender:", senderWallet.address);
    console.log("Receiver 1:", receiver1Wallet.address);
    console.log("Receiver 2:", receiver2Wallet.address);

    // Fund sender with STRK for gas and ETH for transfers
    await fund(senderWallet, Amount.parse(3, STRK)); // STRK for gas
    await fund(senderWallet, Amount.parse(3, ETH)); // ETH for transfers
    console.log("Sender funded");

    // Deploy sender
    await senderWallet.ensureReady({ deploy: "if_needed" });
    console.log("Sender deployed");

    // Get initial balances using erc20.balanceOf() - now returns Amount
    const receiver1BalanceBefore = await receiver1Wallet.balanceOf(ETH);
    const receiver2BalanceBefore = await receiver2Wallet.balanceOf(ETH);

    // Transfer amounts using Amount
    const amount1 = Amount.parse("0.1", ETH); // 0.1 ETH
    const amount2 = Amount.parse("0.2", ETH); // 0.2 ETH

    // Do multi-transfer
    const tx = await senderWallet.transfer(ETH, [
      { to: receiver1Wallet.address, amount: amount1 },
      { to: receiver2Wallet.address, amount: amount2 },
    ]);

    console.log("Multi-transfer tx:", tx.hash);
    await tx.wait();
    console.log("Multi-transfer confirmed");

    // Verify balances using erc20.balanceOf() - now returns Amount
    const receiver1BalanceAfter = await receiver1Wallet.balanceOf(ETH);
    const receiver2BalanceAfter = await receiver2Wallet.balanceOf(ETH);

    // Verify balances using Amount methods
    const receiver1Gained = receiver1BalanceAfter.subtract(
      receiver1BalanceBefore
    );
    const receiver2Gained = receiver2BalanceAfter.subtract(
      receiver2BalanceBefore
    );

    console.log("Receiver 1 gained:", receiver1Gained.toFormatted());
    console.log("Receiver 2 gained:", receiver2Gained.toFormatted());

    expect(receiver1Gained.eq(amount1)).toBe(true);
    expect(receiver2Gained.eq(amount2)).toBe(true);
  });

  it("should use custom token configuration", async () => {
    if (!devnetRunning) {
      console.log("Skipping: devnet not running");
      return;
    }

    // Create sender wallet
    const senderKey = testPrivateKeys.random();
    const senderWallet = await sdk.connectWallet({
      account: {
        signer: new StarkSigner(senderKey),
        accountClass: DevnetPreset,
      },
    });

    // Create receiver wallet
    const receiverKey = testPrivateKeys.random();
    const receiverWallet = await sdk.connectWallet({
      account: {
        signer: new StarkSigner(receiverKey),
        accountClass: DevnetPreset,
      },
    });

    // Fund and deploy sender
    await fund(senderWallet, Amount.parse(2, STRK)); // STRK for gas
    await fund(senderWallet, Amount.parse(2, ETH)); // ETH for transfers
    await senderWallet.ensureReady({ deploy: "if_needed" });

    // Use custom token config (still ETH, but defined manually)
    const customEthToken = {
      name: "Custom Ether",
      symbol: "ETH",
      decimals: 18,
      address: ETH.address,
    };

    // Get balance using erc20.balanceOf() - now returns Amount
    const receiverBalanceBefore =
      await receiverWallet.balanceOf(customEthToken);

    // Use Amount for transfer - using the custom token config
    const transferAmount = Amount.parse("0.05", customEthToken); // 0.05 ETH

    const tx = await senderWallet.transfer(customEthToken, [
      { to: receiverWallet.address, amount: transferAmount },
    ]);

    await tx.wait();
    console.log("Custom token transfer confirmed");

    // Verify balance using Amount methods
    const receiverBalanceAfter = await receiverWallet.balanceOf(customEthToken);
    const gained = receiverBalanceAfter.subtract(receiverBalanceBefore);

    expect(gained.eq(transferAmount)).toBe(true);
  });
});
