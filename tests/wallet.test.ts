import { describe, it, expect, beforeAll } from "vitest";
import { StarkSDK } from "../src/sdk.js";
import { StarkSigner } from "../src/index.js";
import {
  OpenZeppelinPreset,
  ArgentPreset,
  BraavosPreset,
} from "../src/index.js";
import { getTestConfig, testPrivateKeys } from "./config.js";

describe("Wallet", () => {
  const { config, privateKey, network } = getTestConfig();
  let sdk: StarkSDK;

  beforeAll(() => {
    sdk = new StarkSDK(config);
    console.log(`Running tests on ${network}`);
  });

  describe("connectWallet", () => {
    it("should connect with default account (OpenZeppelin)", async () => {
      const signer = new StarkSigner(privateKey);
      const wallet = await sdk.connectWallet({
        account: { signer },
      });

      expect(wallet.address).toBeDefined();
      expect(wallet.address).toMatch(/^0x[a-fA-F0-9]+$/);
    });

    it("should connect with OpenZeppelin preset explicitly", async () => {
      const signer = new StarkSigner(privateKey);
      const wallet = await sdk.connectWallet({
        account: {
          signer,
          accountClass: OpenZeppelinPreset,
        },
      });

      expect(wallet.address).toBeDefined();
    });

    it("should connect with Argent preset", async () => {
      const signer = new StarkSigner(privateKey);
      const wallet = await sdk.connectWallet({
        account: {
          signer,
          accountClass: ArgentPreset,
        },
      });

      expect(wallet.address).toBeDefined();
    });

    it("should connect with Braavos preset", async () => {
      const signer = new StarkSigner(privateKey);
      const wallet = await sdk.connectWallet({
        account: {
          signer,
          accountClass: BraavosPreset,
        },
      });

      expect(wallet.address).toBeDefined();
    });

    it("should compute different addresses for different signers", async () => {
      const signer1 = new StarkSigner(testPrivateKeys.key1);
      const signer2 = new StarkSigner(testPrivateKeys.key2);

      const wallet1 = await sdk.connectWallet({
        account: { signer: signer1 },
      });
      const wallet2 = await sdk.connectWallet({
        account: { signer: signer2 },
      });

      expect(wallet1.address).not.toBe(wallet2.address);
    });

    it("should compute different addresses for different account classes", async () => {
      const signer = new StarkSigner(privateKey);

      const ozWallet = await sdk.connectWallet({
        account: { signer, accountClass: OpenZeppelinPreset },
      });

      const argentWallet = await sdk.connectWallet({
        account: { signer, accountClass: ArgentPreset },
      });

      expect(ozWallet.address).not.toBe(argentWallet.address);
    });

    it("should connect with custom account class", async () => {
      const signer = new StarkSigner(privateKey);
      const customClassHash =
        "0x061dac032f228abef9c6626f995015233097ae253a7f72d68552db02f2971b8f";

      const wallet = await sdk.connectWallet({
        account: {
          signer,
          accountClass: {
            classHash: customClassHash,
            buildConstructorCalldata: (pk) => [pk],
          },
        },
      });

      expect(wallet.address).toBeDefined();
    });

    it("should pass feeMode and timeBounds to wallet", async () => {
      const signer = new StarkSigner(privateKey);
      const wallet = await sdk.connectWallet({
        account: { signer },
        feeMode: "sponsored",
        timeBounds: {
          executeBefore: Math.floor(Date.now() / 1000) + 3600,
        },
      });

      expect(wallet.address).toBeDefined();
    });
  });

  describe("isDeployed", () => {
    it("should return false for new account", async () => {
      const signer = new StarkSigner(testPrivateKeys.random());

      const wallet = await sdk.connectWallet({
        account: { signer },
      });

      const deployed = await wallet.isDeployed();
      expect(deployed).toBe(false);
    });
  });

  describe("preflight", () => {
    it("should fail preflight for undeployed account", async () => {
      const signer = new StarkSigner(testPrivateKeys.random());

      const wallet = await sdk.connectWallet({
        account: { signer },
      });

      const result = await wallet.preflight({
        calls: [
          {
            contractAddress: "0x123",
            entrypoint: "transfer",
            calldata: [],
          },
        ],
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain("not deployed");
      }
    });
  });

  describe("getAccount", () => {
    it("should return the underlying starknet.js account", async () => {
      const signer = new StarkSigner(privateKey);
      const wallet = await sdk.connectWallet({
        account: { signer },
      });

      const account = wallet.getAccount();

      expect(account).toBeDefined();
      expect(account.address).toBe(wallet.address);
    });
  });
});

describe("StarkSDK", () => {
  const { config } = getTestConfig();

  describe("getProvider", () => {
    it("should return the RPC provider", () => {
      const sdk = new StarkSDK(config);
      const provider = sdk.getProvider();

      expect(provider).toBeDefined();
      expect(provider.channel).toBeDefined();
    });
  });
});
