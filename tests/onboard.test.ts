import { beforeEach, describe, expect, it, vi } from "vitest";
import { StarkZap } from "@/sdk";
import { StarkSigner } from "@/signer";
import { ChainId, fromAddress, OnboardStrategy } from "@/types";
import type { SwapProvider } from "@/swap";
import type { DcaProvider } from "@/dca";
import { Wallet, type WalletInterface } from "@/wallet";
import { getTestConfig, testPrivateKeys } from "./config";

function createMockWallet(): WalletInterface {
  const registerProvider = vi.fn();
  const setDefaultProvider = vi.fn();

  return {
    address: fromAddress("0x123"),
    isDeployed: vi.fn().mockResolvedValue(true),
    ensureReady: vi.fn().mockResolvedValue(undefined),
    deploy: vi.fn(),
    execute: vi.fn(),
    callContract: vi.fn(),
    tx: vi.fn(),
    preflight: vi.fn(),
    estimateFee: vi.fn(),
    signMessage: vi.fn(),
    disconnect: vi.fn(),
    getAccount: vi.fn(),
    getProvider: vi.fn(),
    getChainId: vi.fn().mockReturnValue(ChainId.SEPOLIA),
    getFeeMode: vi.fn().mockReturnValue("user_pays"),
    getClassHash: vi.fn().mockReturnValue("0x0"),
    erc20: vi.fn(),
    transfer: vi.fn(),
    balanceOf: vi.fn(),
    getQuote: vi.fn(),
    prepareSwap: vi.fn(),
    swap: vi.fn(),
    registerSwapProvider: vi.fn(),
    setDefaultSwapProvider: vi.fn(),
    getSwapProvider: vi.fn(),
    getDefaultSwapProvider: vi.fn(),
    listSwapProviders: vi.fn().mockReturnValue([]),
    dca: vi.fn().mockReturnValue({
      registerProvider,
      setDefaultProvider,
    }),
    lending: vi.fn(),
    staking: vi.fn(),
    stakingInStaker: vi.fn(),
    enterPool: vi.fn(),
    addToPool: vi.fn(),
    stake: vi.fn(),
    claimPoolRewards: vi.fn(),
    exitPoolIntent: vi.fn(),
    exitPool: vi.fn(),
    isPoolMember: vi.fn(),
    getPoolPosition: vi.fn(),
    getPoolCommission: vi.fn(),
    lstStaking: vi.fn(),
    troves: vi.fn(),
    deposit: vi.fn(),
    getDepositBalance: vi.fn(),
    getAllowance: vi.fn(),
    getDepositFeeEstimate: vi.fn(),
    initiateWithdraw: vi.fn(),
    getWithdrawBalance: vi.fn(),
    getInitiateWithdrawFeeEstimate: vi.fn(),
    completeWithdraw: vi.fn(),
    getCompleteWithdrawFeeEstimate: vi.fn(),
    monitorDeposit: vi.fn(),
    monitorWithdrawal: vi.fn(),
    getDepositState: vi.fn(),
    getWithdrawalState: vi.fn(),
  } as unknown as WalletInterface;
}

describe("StarkZap.onboard", () => {
  const { config } = getTestConfig();
  let sdk: StarkZap;

  beforeEach(() => {
    sdk = new StarkZap(config);
    vi.spyOn(sdk.getProvider(), "getChainId").mockResolvedValue(
      config.chainId!.toFelt252()
    );
  });

  it("applies shared ensure-ready behavior for signer onboarding", async () => {
    const ensureReadySpy = vi
      .spyOn(Wallet.prototype, "ensureReady")
      .mockResolvedValue(undefined);
    const isDeployedSpy = vi
      .spyOn(Wallet.prototype, "isDeployed")
      .mockResolvedValue(true);

    const result = await sdk.onboard({
      strategy: OnboardStrategy.Signer,
      account: { signer: new StarkSigner(testPrivateKeys.key1) },
      deploy: "if_needed",
    });

    expect(result.strategy).toBe(OnboardStrategy.Signer);
    expect(result.deployed).toBe(true);
    expect(ensureReadySpy).toHaveBeenCalledWith({ deploy: "if_needed" });

    ensureReadySpy.mockRestore();
    isDeployedSpy.mockRestore();
  });

  it("applies providers for cartridge onboarding via the shared helper path", async () => {
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
    const wallet = createMockWallet();

    vi.spyOn(sdk, "connectCartridge").mockResolvedValue(
      wallet as Awaited<ReturnType<StarkZap["connectCartridge"]>>
    );

    const result = await sdk.onboard({
      strategy: OnboardStrategy.Cartridge,
      deploy: "never",
      swapProviders: [swapProvider],
      defaultSwapProviderId: "ekubo",
      dcaProviders: [dcaProvider],
      defaultDcaProviderId: "ekubo",
    });

    expect(result.strategy).toBe(OnboardStrategy.Cartridge);
    expect(wallet.registerSwapProvider).toHaveBeenCalledWith(swapProvider);
    expect(wallet.setDefaultSwapProvider).toHaveBeenCalledWith("ekubo");
    expect(wallet.dca().registerProvider).toHaveBeenCalledWith(dcaProvider);
    expect(wallet.dca().setDefaultProvider).toHaveBeenCalledWith("ekubo");
    expect(wallet.ensureReady).not.toHaveBeenCalled();
  });
});
