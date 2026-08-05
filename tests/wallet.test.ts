import { describe, it, expect, beforeAll, vi } from "vitest";
import type { constants } from "starknet";
import { StarkZap } from "@/sdk";
import { StarkSigner } from "@/signer";
import { OpenZeppelinPreset, ArgentPreset, BraavosPreset } from "@/account";
import { Amount, ChainId, fromAddress, type Token } from "@/types";
import type { WalletInterface } from "@/wallet";
import type { SwapProvider } from "@/swap";
import type { DcaProvider } from "@/dca";
import type { PrivacyConfig } from "@/privacy";
import { getTestConfig, testPrivateKeys } from "./config.js";

function createStubWallet(deployed = true): {
  wallet: WalletInterface;
  ensureReady: ReturnType<typeof vi.fn>;
  isDeployed: ReturnType<typeof vi.fn>;
  registerSwapProvider: ReturnType<typeof vi.fn>;
  setDefaultSwapProvider: ReturnType<typeof vi.fn>;
  registerDcaProvider: ReturnType<typeof vi.fn>;
  setDefaultDcaProvider: ReturnType<typeof vi.fn>;
} {
  const ensureReady = vi.fn().mockResolvedValue(undefined);
  const isDeployed = vi.fn().mockResolvedValue(deployed);
  const registerSwapProvider = vi.fn();
  const setDefaultSwapProvider = vi.fn();
  const registerDcaProvider = vi.fn();
  const setDefaultDcaProvider = vi.fn();

  const wallet = {
    ensureReady,
    isDeployed,
    registerSwapProvider,
    setDefaultSwapProvider,
    dca: () => ({
      registerProvider: registerDcaProvider,
      setDefaultProvider: setDefaultDcaProvider,
    }),
  } as unknown as WalletInterface;

  return {
    wallet,
    ensureReady,
    isDeployed,
    registerSwapProvider,
    setDefaultSwapProvider,
    registerDcaProvider,
    setDefaultDcaProvider,
  };
}

describe("Wallet", () => {
  const { config, privateKey, network } = getTestConfig();
  let sdk: StarkZap;
  const testSwapToken: Token = {
    name: "Test USDC",
    symbol: "USDC",
    decimals: 6,
    address: fromAddress("0x1234"),
  };

  beforeAll(() => {
    sdk = new StarkZap(config);
    vi.spyOn(sdk.getProvider(), "getChainId").mockResolvedValue(
      config.chainId!.toFelt252() as constants.StarknetChainId
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
        feeMode: { type: "paymaster" },
        timeBounds: {
          executeBefore: Math.floor(Date.now() / 1000) + 3600,
        },
      });

      expect(wallet.address).toBeDefined();
    });

    it("should accept additional swap providers via connectWallet options", async () => {
      const signer = new StarkSigner(privateKey);
      const ekuboProvider: SwapProvider = {
        id: "ekubo",
        supportsChain: () => true,
        getQuote: vi.fn().mockResolvedValue({
          amountInBase: 1_000_000n,
          amountOutBase: 2_000_000n,
          provider: "ekubo",
        }),
        prepareSwap: vi.fn(),
      };

      const wallet = await sdk.connectWallet({
        account: { signer },
        swapProviders: [ekuboProvider],
        defaultSwapProviderId: "ekubo",
      });

      expect(wallet.getSwapProvider("ekubo")).toBe(ekuboProvider);
      expect(wallet.listSwapProviders()).toContain("ekubo");

      const quote = await wallet.getQuote({
        chainId: ChainId.SEPOLIA,
        tokenIn: testSwapToken,
        tokenOut: testSwapToken,
        amountIn: Amount.parse("1", testSwapToken),
      });

      expect(quote.provider).toBe("ekubo");
      expect(ekuboProvider.getQuote).toHaveBeenCalledTimes(1);
    });

    it("should accept additional DCA providers via connectWallet options", async () => {
      const signer = new StarkSigner(privateKey);
      const ekuboDcaProvider: DcaProvider = {
        id: "ekubo",
        supportsChain: () => true,
        getOrders: vi.fn().mockResolvedValue({
          content: [],
          totalPages: 0,
          totalElements: 0,
          size: 10,
          number: 0,
        }),
        prepareCreate: vi.fn().mockResolvedValue({
          providerId: "ekubo",
          action: "create" as const,
          calls: [
            {
              contractAddress: fromAddress("0x999"),
              entrypoint: "mint_and_increase_sell_amount",
              calldata: [],
            },
          ],
        }),
        prepareCancel: vi.fn().mockResolvedValue({
          providerId: "ekubo",
          action: "cancel" as const,
          calls: [
            {
              contractAddress: fromAddress("0x999"),
              entrypoint: "decrease_sale_rate_to_self",
              calldata: [],
            },
          ],
        }),
      };

      const wallet = await sdk.connectWallet({
        account: { signer },
        dcaProviders: [ekuboDcaProvider],
        defaultDcaProviderId: "ekubo",
      });

      expect(wallet.dca().getDcaProvider("ekubo")).toBe(ekuboDcaProvider);
      expect(wallet.dca().listProviders()).toContain("ekubo");
      expect(wallet.dca().getDefaultDcaProvider()).toBe(ekuboDcaProvider);
    });

    it("should pass the connected wallet address into DCA create requests", async () => {
      const signer = new StarkSigner(testPrivateKeys.key1);
      const testDcaProvider: DcaProvider = {
        id: "dca-probe",
        supportsChain: () => true,
        getOrders: vi.fn().mockResolvedValue({
          content: [],
          totalPages: 0,
          totalElements: 0,
          size: 10,
          pageNumber: 0,
        }),
        prepareCreate: vi.fn().mockResolvedValue({
          providerId: "dca-probe",
          action: "create" as const,
          calls: [
            {
              contractAddress: fromAddress("0x999"),
              entrypoint: "open_dca",
              calldata: [],
            },
          ],
        }),
        prepareCancel: vi.fn().mockResolvedValue({
          providerId: "dca-probe",
          action: "cancel" as const,
          calls: [
            {
              contractAddress: fromAddress("0x999"),
              entrypoint: "cancel_dca",
              calldata: [],
            },
          ],
        }),
      };
      const testBuyToken: Token = {
        name: "Test STRK",
        symbol: "STRK",
        decimals: 18,
        address: fromAddress("0x5678"),
      };

      const wallet = await sdk.connectWallet({
        account: {
          signer,
          accountClass: OpenZeppelinPreset,
        },
        dcaProviders: [testDcaProvider],
        defaultDcaProviderId: "dca-probe",
      });

      const walletAddress = wallet.address;
      const prepared = await wallet.dca().prepareCreate({
        provider: "dca-probe",
        sellToken: testSwapToken,
        buyToken: testBuyToken,
        sellAmount: Amount.parse("10", testSwapToken),
        sellAmountPerCycle: Amount.parse("5", testSwapToken),
        frequency: "PT1H",
      });

      expect(testDcaProvider.prepareCreate).toHaveBeenCalledWith(
        {
          chainId: config.chainId!,
          rpcProvider: wallet.getProvider(),
          walletAddress,
        },
        expect.objectContaining({
          traderAddress: walletAddress,
          sellToken: testSwapToken,
          buyToken: testBuyToken,
          frequency: "PT1H",
        })
      );
      expect(prepared.calls).toHaveLength(1);
      expect(prepared.providerId).toBe("dca-probe");
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

  describe("execute", () => {
    const proof = { data: "0xdeadbeef", proofFacts: ["0x1", "0x2"] };

    it("should forward a transaction proof as execution details", async () => {
      const signer = new StarkSigner(testPrivateKeys.key1);
      const wallet = await sdk.connectWallet({ account: { signer } });

      const account = wallet.getAccount();
      vi.spyOn(wallet, "isDeployed").mockResolvedValue(true);
      const executeSpy = vi
        .spyOn(account, "execute")
        .mockResolvedValue({ transaction_hash: "0xproof" });

      const calls = [
        { contractAddress: "0x123", entrypoint: "apply_actions", calldata: [] },
      ];
      const tx = await wallet.execute(calls, { proof, unsafeUserPays: true });

      expect(tx.hash).toBe("0xproof");
      expect(executeSpy).toHaveBeenCalledWith(calls, {
        proof: proof.data,
        proofFacts: proof.proofFacts,
      });
    });

    it("should pass no execution details when there is no proof", async () => {
      // starknet.js applies its own defaults for undefined details; passing an
      // empty object instead would override them.
      const signer = new StarkSigner(testPrivateKeys.key1);
      const wallet = await sdk.connectWallet({ account: { signer } });

      const account = wallet.getAccount();
      vi.spyOn(wallet, "isDeployed").mockResolvedValue(true);
      const executeSpy = vi
        .spyOn(account, "execute")
        .mockResolvedValue({ transaction_hash: "0xplain" });

      await wallet.execute([
        { contractAddress: "0x123", entrypoint: "transfer", calldata: [] },
      ]);

      expect(executeSpy).toHaveBeenCalledWith(expect.any(Array), undefined);
    });

    it("should refuse to send a proof through the paymaster", async () => {
      // The SNIP-29 paymaster's executable-transaction shape has no field for a
      // proof, so sending would silently drop it and revert on-chain.
      const signer = new StarkSigner(testPrivateKeys.key1);
      const wallet = await sdk.connectWallet({ account: { signer } });

      const account = wallet.getAccount();
      vi.spyOn(wallet, "isDeployed").mockResolvedValue(true);
      const paymasterSpy = vi.spyOn(account, "executePaymasterTransaction");

      await expect(
        wallet.execute(
          [
            {
              contractAddress: "0x123",
              entrypoint: "apply_actions",
              calldata: [],
            },
          ],
          { proof, feeMode: { type: "paymaster" } }
        )
      ).rejects.toThrow("SNIP-29 paymaster cannot carry a transaction proof");

      expect(paymasterSpy).not.toHaveBeenCalled();
    });

    it("should route to paymaster when gasToken is set via feeMode", async () => {
      const signer = new StarkSigner(testPrivateKeys.key1);
      const wallet = await sdk.connectWallet({
        account: { signer },
      });

      const account = wallet.getAccount();
      vi.spyOn(wallet, "isDeployed").mockResolvedValue(true);
      const paymasterSpy = vi
        .spyOn(account, "executePaymasterTransaction")
        .mockResolvedValue({ transaction_hash: "0xgas" });

      const tx = await wallet.execute(
        [
          {
            contractAddress: "0x123",
            entrypoint: "transfer",
            calldata: [],
          },
        ],
        {
          feeMode: {
            type: "paymaster",
            gasToken: fromAddress("0x053c91253bc9"),
          },
        }
      );

      expect(tx.hash).toBe("0xgas");
      expect(paymasterSpy).toHaveBeenCalledTimes(1);
      expect(paymasterSpy).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          feeMode: expect.objectContaining({
            mode: "default",
          }),
        })
      );
    });

    it('should route deprecated "sponsored" to paymaster path', async () => {
      const signer = new StarkSigner(testPrivateKeys.key1);
      const wallet = await sdk.connectWallet({
        account: { signer },
      });

      const account = wallet.getAccount();
      vi.spyOn(wallet, "isDeployed").mockResolvedValue(true);
      const paymasterSpy = vi
        .spyOn(account, "executePaymasterTransaction")
        .mockResolvedValue({ transaction_hash: "0xsponsored" });

      const tx = await wallet.execute(
        [
          {
            contractAddress: "0x123",
            entrypoint: "transfer",
            calldata: [],
          },
        ],
        { feeMode: "sponsored" }
      );

      expect(tx.hash).toBe("0xsponsored");
      expect(paymasterSpy).toHaveBeenCalledTimes(1);
      expect(paymasterSpy).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          feeMode: expect.objectContaining({
            mode: "sponsored",
          }),
        })
      );
    });
  });

  describe("privacy", () => {
    const privacyConfig = {
      poolContractAddress: "0x123",
      prover: "https://prover.example.com",
      discovery: "https://discovery.example.com",
      paymaster: {
        url: "https://paymaster.example.com",
        fee: { mode: "sponsored" } as const,
      },
    };

    it("should explain itself when the SDK config omits privacy", async () => {
      const signer = new StarkSigner(testPrivateKeys.key1);
      const wallet = await sdk.connectWallet({ account: { signer } });

      await expect(wallet.privacy()).rejects.toThrow(
        "requires 'privacy' in the SDK config"
      );
    });

    it("should require a paymaster config to submit", async () => {
      // Not defaulted on purpose: `default` mode needs no API key but its
      // withdrawal takes the suggested-max gas rather than the estimate, so
      // choosing it silently would overcharge.
      const { paymaster: _paymaster, ...incomplete } = privacyConfig;
      const partialSdk = new StarkZap({ ...config, privacy: incomplete });
      vi.spyOn(partialSdk.getProvider(), "getChainId").mockResolvedValue(
        config.chainId!.toFelt252() as constants.StarknetChainId
      );
      const signer = new StarkSigner(testPrivateKeys.key1);
      const wallet = await partialSdk.connectWallet({ account: { signer } });

      await expect(wallet.privacy()).rejects.toThrow(
        "`privacy.paymaster` is required"
      );
    });

    it("cannot be handed half a paymaster config", () => {
      // Pairing the endpoint with the fee mode moved this from a runtime throw
      // to the type: an endpoint without a fee mode does not compile, so there
      // is no half-configured state left for wallet.privacy() to reject.
      //
      // `@ts-expect-error` is the assertion — it fails the typecheck if the
      // expression below ever becomes valid, i.e. if the pairing is loosened.
      const halfConfigured: PrivacyConfig = {
        poolContractAddress: "0x123",
        prover: "https://prover.example.com",
        discovery: "https://discovery.example.com",
        // @ts-expect-error - `fee` is required whenever `paymaster` is given
        paymaster: { url: "https://paymaster.example.com" },
      };

      expect(halfConfigured.paymaster?.url).toBeDefined();
    });

    it("should build the client from the SDK config and reuse it", async () => {
      const privacySdk = new StarkZap({ ...config, privacy: privacyConfig });
      vi.spyOn(privacySdk.getProvider(), "getChainId").mockResolvedValue(
        config.chainId!.toFelt252() as constants.StarknetChainId
      );
      const signer = new StarkSigner(testPrivateKeys.key1);
      const wallet = await privacySdk.connectWallet({ account: { signer } });

      const first = await wallet.privacy();

      // One client means one PrivateRegistry: two clients for the same wallet
      // and pool would hold note/channel state that silently drifts apart.
      expect(await wallet.privacy()).toBe(first);

      // A disconnect ends the session that authorised the viewing key, so the
      // client derived from it must not survive.
      await wallet.disconnect();
      expect(await wallet.privacy()).not.toBe(first);
    });

    it("should revoke the viewing key on disconnect, not just forget it", async () => {
      // Clearing the cache alone would leave the key alive inside the client the
      // caller is still holding — which is the thing that must not outlive the
      // session. So the old client has to refuse, not merely be replaced.
      const privacySdk = new StarkZap({ ...config, privacy: privacyConfig });
      vi.spyOn(privacySdk.getProvider(), "getChainId").mockResolvedValue(
        config.chainId!.toFelt252() as constants.StarknetChainId
      );
      const signer = new StarkSigner(testPrivateKeys.key1);
      const wallet = await privacySdk.connectWallet({ account: { signer } });

      const stale = await wallet.privacy();
      await wallet.disconnect();

      await expect(stale.discoverNotes()).rejects.toThrow(
        "privacy client was revoked"
      );
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
        feeMode: { type: "paymaster" },
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
      const paymasterSdk = new StarkZap({
        ...config,
        paymaster: { nodeUrl: "https://paymaster.example.com" },
      });
      vi.spyOn(paymasterSdk.getProvider(), "getChainId").mockResolvedValue(
        config.chainId!.toFelt252() as constants.StarknetChainId
      );
      const signer = new StarkSigner(testPrivateKeys.random());
      const wallet = await paymasterSdk.connectWallet({
        account: { signer },
        feeMode: { type: "paymaster" },
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

    it("should return ok for undeployed account with paymaster gasToken", async () => {
      const signer = new StarkSigner(testPrivateKeys.random());
      const wallet = await sdk.connectWallet({
        account: { signer },
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
        feeMode: {
          type: "paymaster",
          gasToken: fromAddress("0x053c91253bc9"),
        },
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
      const sdk = new StarkZap(config);
      const mismatchChain = config.chainId?.isMainnet()
        ? ChainId.SEPOLIA
        : ChainId.MAINNET;
      vi.spyOn(sdk.getProvider(), "getChainId").mockResolvedValue(
        mismatchChain.toFelt252() as constants.StarknetChainId
      );

      await expect(
        sdk.connectWallet({
          account: { signer: new StarkSigner(testPrivateKeys.key1) },
        })
      ).rejects.toThrow("RPC chain mismatch");
    });
  });
});

describe("StarkZap", () => {
  const { config } = getTestConfig();

  describe("getProvider", () => {
    it("should return the RPC provider", () => {
      const sdk = new StarkZap(config);
      const provider = sdk.getProvider();

      expect(provider).toBeDefined();
      expect(provider.channel).toBeDefined();
    });
  });

  describe("callContract", () => {
    it("should call provider.callContract", async () => {
      const sdk = new StarkZap(config);
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
      const sdk = new StarkZap(config);
      vi.spyOn(sdk.getProvider(), "getChainId").mockResolvedValue(
        config.chainId!.toFelt252() as constants.StarknetChainId
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

  describe("onboard", () => {
    it("should reuse shared connect options and ensureReady flow for signer onboarding", async () => {
      const sdk = new StarkZap(config);
      const signer = new StarkSigner(testPrivateKeys.key1);
      const swapProvider: SwapProvider = {
        id: "ekubo",
        supportsChain: () => true,
        getQuote: vi.fn(),
        prepareSwap: vi.fn(),
      };
      const dcaProvider: DcaProvider = {
        id: "ekubo",
        supportsChain: () => true,
        getOrders: vi.fn(),
        prepareCreate: vi.fn(),
        prepareCancel: vi.fn(),
      };
      const onProgress = vi.fn();
      const { wallet, ensureReady } = createStubWallet();

      const connectWalletSpy = vi
        .spyOn(sdk, "connectWallet")
        .mockResolvedValue(wallet as never);

      const result = await sdk.onboard({
        strategy: "signer",
        account: { signer },
        feeMode: { type: "paymaster" },
        timeBounds: { executeBefore: 123456 },
        swapProviders: [swapProvider],
        defaultSwapProviderId: "ekubo",
        dcaProviders: [dcaProvider],
        defaultDcaProviderId: "ekubo",
        onProgress,
      });

      expect(connectWalletSpy).toHaveBeenCalledWith({
        account: {
          signer,
          accountClass: OpenZeppelinPreset,
        },
        feeMode: { type: "paymaster" },
        timeBounds: { executeBefore: 123456 },
        swapProviders: [swapProvider],
        defaultSwapProviderId: "ekubo",
        dcaProviders: [dcaProvider],
        defaultDcaProviderId: "ekubo",
      });
      expect(ensureReady).toHaveBeenCalledWith({
        deploy: "if_needed",
        feeMode: { type: "paymaster" },
        onProgress,
      });
      expect(result.wallet).toBe(wallet);
      expect(result.strategy).toBe("signer");
      expect(result.deployed).toBe(true);
    });

    it("should apply providers and skip ensureReady when cartridge onboarding uses deploy never", async () => {
      const sdk = new StarkZap(config);
      const swapProvider: SwapProvider = {
        id: "ekubo",
        supportsChain: () => true,
        getQuote: vi.fn(),
        prepareSwap: vi.fn(),
      };
      const dcaProvider: DcaProvider = {
        id: "ekubo",
        supportsChain: () => true,
        getOrders: vi.fn(),
        prepareCreate: vi.fn(),
        prepareCancel: vi.fn(),
      };
      const {
        wallet,
        ensureReady,
        registerSwapProvider,
        setDefaultSwapProvider,
        registerDcaProvider,
        setDefaultDcaProvider,
      } = createStubWallet();

      const connectCartridgeSpy = vi
        .spyOn(sdk, "connectCartridge")
        .mockResolvedValue(wallet as never);

      const result = await sdk.onboard({
        strategy: "cartridge",
        deploy: "never",
        cartridge: { preset: "social", url: "https://example.com" },
        feeMode: { type: "paymaster" },
        timeBounds: { executeBefore: 123456 },
        swapProviders: [swapProvider],
        defaultSwapProviderId: "ekubo",
        dcaProviders: [dcaProvider],
        defaultDcaProviderId: "ekubo",
      });

      expect(connectCartridgeSpy).toHaveBeenCalledWith({
        preset: "social",
        url: "https://example.com",
        feeMode: { type: "paymaster" },
        timeBounds: { executeBefore: 123456 },
      });
      expect(registerSwapProvider).toHaveBeenCalledWith(swapProvider);
      expect(setDefaultSwapProvider).toHaveBeenCalledWith("ekubo");
      expect(registerDcaProvider).toHaveBeenCalledWith(dcaProvider);
      expect(setDefaultDcaProvider).toHaveBeenCalledWith("ekubo");
      expect(ensureReady).not.toHaveBeenCalled();
      expect(result.wallet).toBe(wallet);
      expect(result.strategy).toBe("cartridge");
      expect(result.deployed).toBe(true);
    });
  });
});
