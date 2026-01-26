import { describe, it, expect, beforeAll } from "vitest";
import { RpcProvider } from "starknet";
import { StarkSDK } from "../../src/sdk.js";
import { StarkSigner } from "../../src/index.js";
import { DevnetPreset } from "../../src/index.js";
import { getTestConfig, testPrivateKeys } from "../config.js";

/**
 * Integration tests that require a running devnet.
 *
 * Start devnet with:
 *   npm run devnet:start
 *
 * Run these tests with:
 *   npm run test:integration
 */
describe("Account Deployment (Integration)", () => {
  const { config, network } = getTestConfig();
  let sdk: StarkSDK;
  let provider: RpcProvider;
  let devnetRunning = false;

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
   */
  async function fundAccount(address: string, amount = "1000000000000000000") {
    const response = await fetch("http://127.0.0.1:5050", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "devnet_mint",
        params: { address, amount: Number(amount) },
        id: 1,
      }),
    });
    const result = await response.json();
    if (result.error) {
      throw new Error(result.error.message);
    }
    return result;
  }

  it("should deploy a new account", async () => {
    if (!devnetRunning) {
      console.log("Skipping: devnet not running");
      return;
    }

    // Generate a fresh key
    const freshKey = testPrivateKeys.random();
    const signer = new StarkSigner(freshKey);

    const wallet = await sdk.connectWallet({
      account: {
        signer,
        accountClass: DevnetPreset,
      },
    });

    console.log("Account address:", wallet.address);

    // Fund the account
    await fundAccount(wallet.address);
    console.log("Account funded");

    // Check not deployed yet
    const deployedBefore = await wallet.isDeployed();
    expect(deployedBefore).toBe(false);

    // Deploy
    const tx = await wallet.deploy();
    console.log("Deploy tx:", tx.hash);
    console.log("Explorer:", tx.explorerUrl);

    // Wait for deployment
    await tx.wait();
    console.log("Deployment confirmed");

    // Verify deployed
    const deployedAfter = await wallet.isDeployed();
    expect(deployedAfter).toBe(true);
  });

  it("should use ensureReady to deploy if needed", async () => {
    if (!devnetRunning) {
      console.log("Skipping: devnet not running");
      return;
    }

    const freshKey = testPrivateKeys.random();
    const signer = new StarkSigner(freshKey);

    const wallet = await sdk.connectWallet({
      account: {
        signer,
        accountClass: DevnetPreset,
      },
    });

    // Fund account
    await fundAccount(wallet.address);

    const progressSteps: string[] = [];

    await wallet.ensureReady({
      deploy: "if_needed",
      onProgress: (event) => {
        progressSteps.push(event.step);
        console.log("Progress:", event.step);
      },
    });

    // Should have gone through all steps
    expect(progressSteps).toContain("CONNECTED");
    expect(progressSteps).toContain("CHECK_DEPLOYED");
    expect(progressSteps).toContain("DEPLOYING");
    expect(progressSteps).toContain("READY");

    // Should now be deployed
    const deployed = await wallet.isDeployed();
    expect(deployed).toBe(true);
  });

  it("should skip deployment if already deployed", async () => {
    if (!devnetRunning) {
      console.log("Skipping: devnet not running");
      return;
    }

    const freshKey = testPrivateKeys.random();
    const signer = new StarkSigner(freshKey);

    const wallet = await sdk.connectWallet({
      account: {
        signer,
        accountClass: DevnetPreset,
      },
    });

    // Fund and deploy
    await fundAccount(wallet.address);
    await wallet.ensureReady({ deploy: "if_needed" });

    // Now call ensureReady again - should skip deployment
    const progressSteps: string[] = [];
    await wallet.ensureReady({
      deploy: "if_needed",
      onProgress: (event) => {
        progressSteps.push(event.step);
        console.log("Progress:", event.step);
      },
    });

    // Should NOT have DEPLOYING step
    expect(progressSteps).toContain("CONNECTED");
    expect(progressSteps).toContain("CHECK_DEPLOYED");
    expect(progressSteps).not.toContain("DEPLOYING");
    expect(progressSteps).toContain("READY");
  });

  it("should check deployment status correctly", async () => {
    if (!devnetRunning) {
      console.log("Skipping: devnet not running");
      return;
    }

    const signer = new StarkSigner(testPrivateKeys.key1);
    const wallet = await sdk.connectWallet({
      account: {
        signer,
        accountClass: DevnetPreset,
      },
    });

    const deployed = await wallet.isDeployed();
    console.log(`Account ${wallet.address} deployed: ${deployed}`);

    expect(typeof deployed).toBe("boolean");
  });
});
