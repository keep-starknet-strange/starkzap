import { describe, it, expect, beforeAll, vi } from "vitest";
import { StarkSDK } from "@/sdk";
import { StarkSigner } from "@/signer";
import { OpenZeppelinPreset, ArgentPreset, BraavosPreset } from "@/account";
import { ChainId } from "@/types";
import { getTestConfig, testPrivateKeys } from "./config.js";

describe("Wallet", () => {
  const { config, privateKey, network } = getTestConfig();
  let sdk: StarkSDK;

  beforeAll(() => {
    sdk = new StarkSDK(config);
    vi.spyOn(sdk.getProvider(), "getChainId").mockResolvedValue(
      config.chainId!.toFelt252()
    );
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
      vi.spyOn(wallet.getProvider(), "getClassHashAt").mockRejectedValue(
        new Error("Contract not found")
      );

      const deployed = await wallet.isDeployed();
      expect(deployed).toBe(false);
    });
  });

  describe("deploy", () => {
    it("should use account salt from accountClass when deploying", async () => {
      const signer = new StarkSigner(testPrivateKeys.key1);
      const customSalt = "0x12345";
      const wallet = await sdk.connectWallet({
        account: {
          signer,
          accountClass: {
            classHash:
              "0x061dac032f228abef9c6626f995015233097ae253a7f72d68552db02f2971b8f",
            buildConstructorCalldata: (pk) => [pk],
            getSalt: () => customSalt,
          },
        },
      });

      const account = wallet.getAccount();
      const estimateSpy = vi.spyOn(account, "estimateAccountDeployFee");
      estimateSpy.mockResolvedValue({
        resourceBounds: {
          l1_gas: { max_amount: 1n, max_price_per_unit: 1n },
          l2_gas: { max_amount: 1n, max_price_per_unit: 1n },
          l1_data_gas: { max_amount: 1n, max_price_per_unit: 1n },
        },
      } as Awaited<ReturnType<typeof account.estimateAccountDeployFee>>);

      const deploySpy = vi.spyOn(account, "deployAccount");
      deploySpy.mockResolvedValue({
        transaction_hash: "0x123",
      } as Awaited<ReturnType<typeof account.deployAccount>>);

      await wallet.deploy({ feeMode: "user_pays" });

      expect(estimateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ addressSalt: customSalt })
      );
      expect(deploySpy).toHaveBeenCalledWith(
        expect.objectContaining({ addressSalt: customSalt }),
        expect.any(Object)
      );
    });

    it("should not mark deployed cache true before deployment finality", async () => {
      const signer = new StarkSigner(testPrivateKeys.key1);
      const wallet = await sdk.connectWallet({
        account: { signer },
      });

      const account = wallet.getAccount();
      vi.spyOn(account, "estimateAccountDeployFee").mockResolvedValue({
        resourceBounds: {
          l1_gas: { max_amount: 1n, max_price_per_unit: 1n },
          l2_gas: { max_amount: 1n, max_price_per_unit: 1n },
          l1_data_gas: { max_amount: 1n, max_price_per_unit: 1n },
        },
      } as Awaited<ReturnType<typeof account.estimateAccountDeployFee>>);
      vi.spyOn(account, "deployAccount").mockResolvedValue({
        transaction_hash: "0x456",
      } as Awaited<ReturnType<typeof account.deployAccount>>);

      vi.spyOn(wallet.getProvider(), "getClassHashAt").mockRejectedValue(
        new Error("Contract not found")
      );

      await wallet.deploy({ feeMode: "user_pays" });
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
      vi.spyOn(wallet, "isDeployed").mockResolvedValue(false);

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

    it("should return ok for sponsored mode with default paymaster", async () => {
      const signer = new StarkSigner(testPrivateKeys.random());
      const wallet = await sdk.connectWallet({
        account: { signer },
        feeMode: "sponsored",
      });
      vi.spyOn(wallet, "isDeployed").mockResolvedValue(false);
      const simulateSpy = vi.spyOn(wallet.getAccount(), "simulateTransaction");

      const result = await wallet.preflight({
        calls: [
          {
            contractAddress: "0x123",
            entrypoint: "transfer",
            calldata: [],
          },
        ],
      });

      expect(result.ok).toBe(true);
      expect(simulateSpy).not.toHaveBeenCalled();
    });

    it("should return ok for sponsored mode when paymaster is configured", async () => {
      const paymasterSdk = new StarkSDK({
        ...config,
        paymaster: { nodeUrl: "https://paymaster.example.com" },
      });
      vi.spyOn(paymasterSdk.getProvider(), "getChainId").mockResolvedValue(
        config.chainId!.toFelt252()
      );
      const signer = new StarkSigner(testPrivateKeys.random());
      const wallet = await paymasterSdk.connectWallet({
        account: { signer },
        feeMode: "sponsored",
      });
      vi.spyOn(wallet, "isDeployed").mockResolvedValue(false);
      const simulateSpy = vi.spyOn(wallet.getAccount(), "simulateTransaction");

      const result = await wallet.preflight({
        calls: [
          {
            contractAddress: "0x123",
            entrypoint: "transfer",
            calldata: [],
          },
        ],
      });

      expect(result.ok).toBe(true);
      expect(simulateSpy).not.toHaveBeenCalled();
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

  describe("callContract", () => {
    it("should call provider.callContract for read-only calls", async () => {
      const signer = new StarkSigner(privateKey);
      const wallet = await sdk.connectWallet({
        account: { signer },
      });

      const call = {
        contractAddress: "0x123",
        entrypoint: "balance_of",
        calldata: ["0xabc"],
      };
      vi.spyOn(wallet.getProvider(), "callContract").mockResolvedValue(["0x1"]);

      const result = await wallet.callContract(call);
      expect(result).toEqual(["0x1"]);
      expect(wallet.getProvider().callContract).toHaveBeenCalledWith(call);
    });
  });

  describe("chain validation", () => {
    it("should reject connectWallet when provider chain mismatches config", async () => {
      const sdk = new StarkSDK(config);
      const mismatchChain = config.chainId?.isMainnet()
        ? ChainId.SEPOLIA
        : ChainId.MAINNET;
      vi.spyOn(sdk.getProvider(), "getChainId").mockResolvedValue(
        mismatchChain.toFelt252()
      );

      await expect(
        sdk.connectWallet({
          account: { signer: new StarkSigner(testPrivateKeys.key1) },
        })
      ).rejects.toThrow("RPC chain mismatch");
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

  describe("callContract", () => {
    it("should call provider.callContract", async () => {
      const sdk = new StarkSDK(config);
      const call = {
        contractAddress: "0x123",
        entrypoint: "total_supply",
        calldata: [],
      };

      vi.spyOn(sdk.getProvider(), "callContract").mockResolvedValue(["0x2a"]);

      const result = await sdk.callContract(call);
      expect(result).toEqual(["0x2a"]);
      expect(sdk.getProvider().callContract).toHaveBeenCalledWith(call);
    });
  });

  describe("connectCartridge", () => {
    it("should reject in react-native-like runtime", async () => {
      const sdk = new StarkSDK(config);
      vi.spyOn(sdk.getProvider(), "getChainId").mockResolvedValue(
        config.chainId!.toFelt252()
      );
      try {
        vi.stubGlobal("window", {});
        vi.stubGlobal("navigator", { product: "ReactNative" });

        await expect(sdk.connectCartridge()).rejects.toThrow(
          "Cartridge is only supported in web environments"
        );
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });
});
