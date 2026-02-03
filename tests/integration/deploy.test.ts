import { beforeAll, describe, expect, inject, it } from "vitest";
import { StarkSDK } from "@/sdk";
import { StarkSigner } from "@/signer";
import { DevnetPreset } from "@/account";
import { DevnetProvider } from "starknet-devnet";
import { fund } from "./shared";
import { testPrivateKeys } from "../config";

describe("Account Deployment (Integration)", () => {
  const config = inject("sdkConfig");
  let sdk: StarkSDK;
  let devnetRunning: boolean;

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

  it("should deploy a new account", async () => {
    if (!devnetRunning) {
      console.error("Skipping: devnet not running");
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
    await fund(wallet);
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
    await fund(wallet);

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
    await fund(wallet);
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
