import { EthereumBridge } from "@/bridge/ethereum/EthereumBridge";
import type {
  BridgeDepositOptions,
  CompleteBridgeWithdrawOptions,
  InitiateBridgeWithdrawOptions,
} from "@/bridge/types/BridgeInterface";
import {
  DUMMY_SN_ADDRESS,
  type EthereumCompleteWithdrawFeeEstimation,
  type EthereumInitiateWithdrawFeeEstimation,
  type EthereumWalletConfig,
  type OftDepositFeeEstimation,
} from "@/bridge/ethereum/types";
import type {
  Address,
  ExternalAddress,
  ExternalTransactionResponse,
} from "@/types";
import {
  Amount,
  type EthereumAddress,
  EthereumBridgeToken,
  ExternalChain,
} from "@/types";
import type { WalletInterface } from "@/wallet";
import type { ContractTransaction } from "ethers";
import { FeeErrorCause } from "@/types/errors";
import { LayerZeroApi } from "@/bridge/ethereum/oft/LayerZeroApi";
import {
  DEFAULT_OFT_DEPOSIT_GAS_REQUIREMENT,
  DEFAULT_OFT_MIN_AMOUNT,
  OFT_MIN_AMOUNT_BY_TOKEN_ID,
} from "@/bridge/ethereum/oft/constants";
import { Protocol } from "@/types/bridge/protocol";
import type { Tx } from "@/tx";
import type { StarkZapLogger } from "@/logger";

const DUMMY_ETH_ADDRESS = "0x0000000000000000000000000000000000000001";
const DUMMY_DEPOSIT_TX_CACHE_TTL_MS = 60_000;

type DummyDepositTxCache = {
  promise: Promise<ContractTransaction | null>;
  createdAt: number;
};

export class OftBridge extends EthereumBridge {
  private readonly layerZeroApi: LayerZeroApi;
  private cachedSpender: EthereumAddress | null | undefined;
  private dummyDepositTxCache: DummyDepositTxCache | null = null;

  constructor(
    bridgeToken: EthereumBridgeToken,
    config: EthereumWalletConfig,
    starknetWallet: WalletInterface,
    apiKey: string,
    logger: StarkZapLogger
  ) {
    super(bridgeToken, config, starknetWallet, logger);

    const chainId = starknetWallet.getChainId();
    if (!chainId.isMainnet()) {
      throw new Error(
        "OFT bridging is only supported on Starknet Mainnet. " +
          "The LayerZero Value Transfer API does not support testnets."
      );
    }

    this.layerZeroApi = new LayerZeroApi({
      externalTokenAddress: bridgeToken.address,
      starknetTokenAddress: bridgeToken.starknetAddress,
      externalChainKey: ExternalChain.ETHEREUM,
      apiKey,
    });
  }

  async deposit(
    recipient: Address,
    amount: Amount,
    _options?: BridgeDepositOptions
  ): Promise<ExternalTransactionResponse> {
    await this.approveSpendingOf(amount);

    const signerAddress = await this.config.signer.getAddress();
    const quotes = await this.layerZeroApi.getDepositQuotes({
      srcWalletAddress: signerAddress,
      dstWalletAddress: recipient,
      amount,
    });

    const depositTx = this.layerZeroApi.getDepositTransaction(quotes);
    if (!depositTx) {
      throw new Error(
        "Failed to get OFT deposit transaction from LayerZero API."
      );
    }

    const response = await this.execute(depositTx);
    this.clearCachedAllowance();
    this.clearDummyDepositTxCache();
    return { hash: response.hash };
  }

  async getDepositFeeEstimate(
    _options?: BridgeDepositOptions
  ): Promise<OftDepositFeeEstimation> {
    const [allowance, dummyDepositTx, approvalFeeEstimation] =
      await Promise.all([
        this.getAllowance(),
        this.getDummyDepositTx(),
        this.estimateApprovalFee(),
      ]);

    const { approvalFee, approvalFeeError } = approvalFeeEstimation;

    const interchainFee = this.ethAmount(
      BigInt(dummyDepositTx?.value?.toString() ?? "0")
    );

    let l1Fee: Amount;
    let l1FeeError: FeeErrorCause | undefined;

    const needsFallback = allowance !== null && allowance.isZero();
    if (needsFallback || !dummyDepositTx) {
      const feeDecimal =
        DEFAULT_OFT_DEPOSIT_GAS_REQUIREMENT *
        (await this.getEthereumGasPrice());
      l1Fee = this.ethAmount(feeDecimal);
      if (!dummyDepositTx) {
        l1FeeError = FeeErrorCause.GENERIC_L1_FEE_ERROR;
      }
    } else {
      try {
        const [gasUnits, gasPrice] = await Promise.all([
          this.config.provider.estimateGas(dummyDepositTx),
          this.getEthereumGasPrice(),
        ]);
        l1Fee = this.ethAmount(gasUnits * gasPrice);
      } catch {
        l1Fee = this.ethAmount(0n);
        l1FeeError = FeeErrorCause.GENERIC_L1_FEE_ERROR;
      }
    }

    return {
      l1Fee,
      l1FeeError,
      l2Fee: interchainFee,
      interchainFee,
      approvalFee,
      approvalFeeError,
    };
  }

  override async initiateWithdraw(
    recipient: ExternalAddress,
    amount: Amount,
    options?: InitiateBridgeWithdrawOptions
  ): Promise<Tx> {
    const signerAddress = this.starknetWallet.address.toString();
    const quotes = await this.layerZeroApi.getWithdrawQuotes({
      srcWalletAddress: signerAddress,
      dstWalletAddress: recipient.toString(),
      amount,
    });

    const calls = this.layerZeroApi.getWithdrawCalls(quotes);
    if (calls.length === 0) {
      throw new Error(
        "Failed to get OFT withdraw transaction from LayerZero API."
      );
    }

    return this.starknetWallet.execute(calls, options);
  }

  async getInitiateWithdrawFeeEstimate(
    _options?: InitiateBridgeWithdrawOptions
  ): Promise<EthereumInitiateWithdrawFeeEstimation> {
    try {
      const signerAddress = this.starknetWallet.address.toString();
      const quotes = await this.layerZeroApi.getWithdrawQuotes({
        srcWalletAddress: signerAddress,
        dstWalletAddress: DUMMY_ETH_ADDRESS,
        amount: this.getOftMinAmount(),
      });
      const calls = this.layerZeroApi.getWithdrawCalls(quotes);
      if (calls.length > 0) {
        const estimate = await this.starknetWallet.estimateFee(calls);
        const isFri = estimate.unit === "FRI";
        return {
          l2Fee: Amount.fromRaw(
            estimate.overall_fee,
            18,
            isFri ? "STRK" : "ETH"
          ),
        };
      }
    } catch {
      // fall through to error result
    }

    return {
      l2Fee: Amount.fromRaw(0n, 18, "STRK"),
      l2FeeError: FeeErrorCause.GENERIC_L2_FEE_ERROR,
    };
  }

  async completeWithdraw(
    recipient: ExternalAddress,
    amount: Amount,
    options?: CompleteBridgeWithdrawOptions
  ): Promise<ExternalTransactionResponse> {
    if (this.bridgeToken.protocol !== Protocol.OFT_MIGRATED) {
      throw new Error(
        "OFT tokens are delivered automatically via LayerZero and do not require a completion step."
      );
    }
    return super.completeWithdraw(recipient, amount, options);
  }

  async getCompleteWithdrawFeeEstimate(
    amount: Amount,
    recipient: ExternalAddress,
    options?: CompleteBridgeWithdrawOptions
  ): Promise<EthereumCompleteWithdrawFeeEstimation> {
    if (this.bridgeToken.protocol !== Protocol.OFT_MIGRATED) {
      throw new Error(
        "OFT tokens are delivered automatically via LayerZero and do not have a completion fee."
      );
    }
    return super.getCompleteWithdrawFeeEstimate(amount, recipient, options);
  }

  protected async getAllowanceSpender(): Promise<EthereumAddress | null> {
    if (this.cachedSpender !== undefined) {
      return this.cachedSpender;
    }

    try {
      const quotes = await this.layerZeroApi.getDepositQuotes({
        srcWalletAddress: DUMMY_ETH_ADDRESS,
        dstWalletAddress: DUMMY_SN_ADDRESS.toString(),
        amount: this.getOftMinAmount(),
      });

      const approvalTx = this.layerZeroApi.getApprovalTransaction(quotes);
      this.cachedSpender =
        this.layerZeroApi.extractSpenderFromApprovalTx(approvalTx);
    } catch {
      // Do not cache transient API failures as "no spender";
      // allow subsequent calls to retry spender discovery.
      this.cachedSpender = undefined;
      return null;
    }

    return this.cachedSpender;
  }

  private getOftMinAmount(): Amount {
    const amountBase =
      OFT_MIN_AMOUNT_BY_TOKEN_ID[this.bridgeToken.id] ?? DEFAULT_OFT_MIN_AMOUNT;
    return Amount.fromRaw(
      amountBase,
      this.bridgeToken.decimals,
      this.bridgeToken.symbol
    );
  }

  private getDummyDepositTx(): Promise<ContractTransaction | null> {
    const now = Date.now();
    const cached = this.dummyDepositTxCache;
    if (cached && now - cached.createdAt < DUMMY_DEPOSIT_TX_CACHE_TTL_MS) {
      return cached.promise;
    }

    const promise = this.fetchDummyDepositTx().then((tx) => {
      // Retry quickly after transient failures rather than pinning null for the full TTL.
      if (!tx && this.dummyDepositTxCache?.promise === promise) {
        this.dummyDepositTxCache = null;
      }
      return tx;
    });

    this.dummyDepositTxCache = { promise, createdAt: now };
    return promise;
  }

  private async fetchDummyDepositTx(): Promise<ContractTransaction | null> {
    try {
      const signerAddress = await this.config.signer.getAddress();
      const quotes = await this.layerZeroApi.getDepositQuotes({
        srcWalletAddress: signerAddress,
        dstWalletAddress: DUMMY_SN_ADDRESS.toString(),
        amount: this.getOftMinAmount(),
      });
      return this.layerZeroApi.getDepositTransaction(quotes);
    } catch {
      return null;
    }
  }

  private clearDummyDepositTxCache(): void {
    this.dummyDepositTxCache = null;
  }
}
