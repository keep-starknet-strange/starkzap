import { describe, it, expect, beforeAll } from "vitest";
import { RpcProvider } from "starknet";
import { StarkSDK } from "../../src/sdk.js";
import { Erc20 } from "../../src/erc20/index.js";
import { StarkSigner, DevnetPreset, Amount } from "../../src/index.js";
import { sepoliaTokens } from "../../src/index.js";
import { getTestConfig, testPrivateKeys } from "../config.js";

/**
 * ERC20 integration tests that require a running devnet.
 *
 * Start devnet with:
 *   npm run devnet:start
 *
 * Run these tests with:
 *   npm run test:integration
 */
describe("ERC20 (Integration)", () => {
  const { config, network } = getTestConfig();
  let sdk: StarkSDK;
  let provider: RpcProvider;
  let devnetRunning = false;

  // Use ETH token for testing (available on devnet)
  const ETH = sepoliaTokens.ETH!;

  beforeAll(async () => {
    sdk = new StarkSDK(config);
    provider = sdk.getProvider();

    try {
      await provider.getChainId();
      devnetRunning = true;
      console.log(`Connected to ${network}`);
    } catch {
      console.warn("Devnet not running, skipping integration tests");
    }
  });

  /**
   * Fund an account using devnet's mint endpoint.
   * @param unit - "WEI" for ETH, "FRI" for STRK
   */
  async function fundAccount(
    address: string,
    amount = "1000000000000000000",
    unit: "WEI" | "FRI" = "WEI"
  ) {
    const response = await fetch("http://127.0.0.1:5050", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "devnet_mint",
        params: { address, amount: Number(amount), unit },
        id: 1,
      }),
    });
    const result = await response.json();
    if (result.error) {
      throw new Error(result.error.message);
    }
    return result;
  }

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
    const fundAmount = "2000000000000000000"; // 2 ETH
    await fundAccount(senderWallet.address, fundAmount, "FRI"); // STRK for gas
    await fundAccount(senderWallet.address, fundAmount, "WEI"); // ETH for transfer
    await fundAccount(receiverWallet.address, "100000000000000000", "FRI"); // STRK for deployment
    console.log("Accounts funded");

    // Deploy sender account
    await senderWallet.ensureReady({ deploy: "if_needed" });
    console.log("Sender deployed");

    // Create ERC20 instance
    const erc20 = new Erc20(ETH);

    // Get initial balances using erc20.balanceOf() - now returns Amount
    const senderBalanceBefore = await erc20.balanceOf({ wallet: senderWallet });
    const receiverBalanceBefore = await erc20.balanceOf({
      wallet: receiverWallet,
    });
    console.log("Sender balance before:", senderBalanceBefore.toFormatted());
    console.log(
      "Receiver balance before:",
      receiverBalanceBefore.toFormatted()
    );

    // Transfer amount: 0.1 ETH using Amount
    const transferAmount = Amount.parse("0.1", ETH);

    // Transfer tokens
    const tx = await erc20.transfer({
      from: senderWallet,
      transfers: [{ to: receiverWallet.address, amount: transferAmount }],
    });

    console.log("Transfer tx:", tx.hash);

    // Wait for transaction
    await tx.wait();
    console.log("Transfer confirmed");

    // Get final balances using erc20.balanceOf() - now returns Amount
    const senderBalanceAfter = await erc20.balanceOf({ wallet: senderWallet });
    const receiverBalanceAfter = await erc20.balanceOf({
      wallet: receiverWallet,
    });
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
    await fundAccount(senderWallet.address, "3000000000000000000", "FRI"); // STRK for gas
    await fundAccount(senderWallet.address, "3000000000000000000", "WEI"); // ETH for transfers
    console.log("Sender funded");

    // Deploy sender
    await senderWallet.ensureReady({ deploy: "if_needed" });
    console.log("Sender deployed");

    // Create ERC20 instance
    const erc20 = new Erc20(ETH);

    // Get initial balances using erc20.balanceOf() - now returns Amount
    const receiver1BalanceBefore = await erc20.balanceOf({
      wallet: receiver1Wallet,
    });
    const receiver2BalanceBefore = await erc20.balanceOf({
      wallet: receiver2Wallet,
    });

    // Transfer amounts using Amount
    const amount1 = Amount.parse("0.1", ETH); // 0.1 ETH
    const amount2 = Amount.parse("0.2", ETH); // 0.2 ETH

    // Do multi-transfer
    const tx = await erc20.transfer({
      from: senderWallet,
      transfers: [
        { to: receiver1Wallet.address, amount: amount1 },
        { to: receiver2Wallet.address, amount: amount2 },
      ],
    });

    console.log("Multi-transfer tx:", tx.hash);
    await tx.wait();
    console.log("Multi-transfer confirmed");

    // Verify balances using erc20.balanceOf() - now returns Amount
    const receiver1BalanceAfter = await erc20.balanceOf({
      wallet: receiver1Wallet,
    });
    const receiver2BalanceAfter = await erc20.balanceOf({
      wallet: receiver2Wallet,
    });

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
    await fundAccount(senderWallet.address, "2000000000000000000", "FRI"); // STRK for gas
    await fundAccount(senderWallet.address, "2000000000000000000", "WEI"); // ETH for transfers
    await senderWallet.ensureReady({ deploy: "if_needed" });

    // Use custom token config (still ETH, but defined manually)
    const customEthToken = {
      name: "Custom Ether",
      symbol: "ETH",
      decimals: 18,
      address: ETH.address,
    };

    // Create ERC20 instance with custom token config
    const erc20 = new Erc20(customEthToken);

    // Get balance using erc20.balanceOf() - now returns Amount
    const receiverBalanceBefore = await erc20.balanceOf({
      wallet: receiverWallet,
    });

    // Use Amount for transfer - using the custom token config
    const transferAmount = Amount.parse("0.05", customEthToken); // 0.05 ETH

    const tx = await erc20.transfer({
      from: senderWallet,
      transfers: [{ to: receiverWallet.address, amount: transferAmount }],
    });

    await tx.wait();
    console.log("Custom token transfer confirmed");

    // Verify balance using Amount methods
    const receiverBalanceAfter = await erc20.balanceOf({
      wallet: receiverWallet,
    });
    const gained = receiverBalanceAfter.subtract(receiverBalanceBefore);

    expect(gained.eq(transferAmount)).toBe(true);
  });
});
