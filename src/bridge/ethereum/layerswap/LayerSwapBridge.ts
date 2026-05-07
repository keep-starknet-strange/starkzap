import { EthereumBridge } from "@/bridge/ethereum/EthereumBridge";
import type {
  BridgeDepositOptions,
  CompleteBridgeWithdrawOptions,
  InitiateBridgeWithdrawOptions,
} from "@/bridge/types/BridgeInterface";
import { LayerSwapApi } from "@/bridge/ethereum/layerswap/LayerSwapApi";
import { normalizeLsTxHash } from "@/bridge/ethereum/layerswap/hashes";
import type {
  LayerSwapApiConfig,
  LsDepositAction,
} from "@/bridge/ethereum/layerswap/types";
import {
  DUMMY_SN_ADDRESS,
  type EthereumCompleteWithdrawFeeEstimation,
  type EthereumWalletConfig,
  type LayerSwapDepositFeeEstimation,
  type LayerSwapInitiateWithdrawFeeEstimation,
} from "@/bridge/ethereum/types";
import {
  type Address,
  Amount,
  type EthereumAddress,
  EthereumBridgeToken,
  type ExternalAddress,
  type ExternalTransactionResponse,
} from "@/types";
import { FeeErrorCause } from "@/types/errors";
import type { WalletInterface } from "@/wallet";
import type { StarkZapLogger } from "@/logger";
import type { TransactionRequest } from "ethers";
import type { Tx } from "@/tx";
import { type Call, CallData, uint256 } from "starknet";

// Fallback gas units when `provider.estimateGas` fails (e.g. the user has no
// source-token balance yet). Native ETH send ≈ 21k; ERC20 transfer ≈ 45–65k
// depending on destination slot warmth. Chosen as conservative upper bounds.
const NATIVE_DEPOSIT_FALLBACK_GAS = 21_000n;
const ERC20_DEPOSIT_FALLBACK_GAS = 65_000n;

/**
 * LayerSwap bridge provider for cross-chain deposits via the LayerSwap API.
 *
 * Handles Ethereum → Starknet transfers. The deposit flow:
 * 1. Creates a swap on LayerSwap API
 * 2. Retrieves deposit actions (EVM transactions to execute)
 * 3. Executes the deposit on Ethereum via the connected signer
 * 4. Notifies LayerSwap for faster detection
 *
 * Routed by {@link BridgeOperator} when `token.protocol === Protocol.LAYERSWAP`.
 */
export class LayerSwapBridge extends EthereumBridge {
  private readonly api: LayerSwapApi;
  private readonly sourceNetwork: string;
  private readonly destNetwork: string;

  constructor(
    bridgeToken: EthereumBridgeToken,
    config: EthereumWalletConfig,
    starknetWallet: WalletInterface,
    apiKey: string,
    logger: StarkZapLogger,
    apiConfig?: Omit<LayerSwapApiConfig, "apiKey">
  ) {
    super(bridgeToken, config, starknetWallet, logger);
    this.api = new LayerSwapApi({ apiKey, ...apiConfig });
    const mainnet = starknetWallet.getChainId().isMainnet();
    this.sourceNetwork = mainnet ? "ETHEREUM_MAINNET" : "ETHEREUM_SEPOLIA";
    this.destNetwork = mainnet ? "STARKNET_MAINNET" : "STARKNET_SEPOLIA";
  }

  async deposit(
    recipient: Address,
    amount: Amount,
    _options?: BridgeDepositOptions
  ): Promise<ExternalTransactionResponse> {
    const signerAddress = await this.config.signer.getAddress();

    const response = await this.api.createSwap({
      sourceNetwork: this.sourceNetwork,
      sourceToken: this.bridgeToken.symbol,
      destinationNetwork: this.destNetwork,
      destinationToken: this.bridgeToken.symbol,
      amount: amount.toUnit(),
      destinationAddress: recipient.toString(),
      sourceAddress: signerAddress,
      refundAddress: signerAddress,
    });

    const swap = response.swap;

    const actions =
      response.deposit_actions.length > 0
        ? response.deposit_actions
        : await this.api.getDepositActions(swap.id, signerAddress);
    const action = actions.find(
      (a) => a.network.name === this.sourceNetwork && a.type === "transfer"
    );

    if (!action) {
      throw new Error(
        `No transfer deposit action for swap "${swap.id}" on network "${this.sourceNetwork}".`
      );
    }

    const { hash } = await this.executeEvmDepositAction(action);

    // Nudge LayerSwap to detect the source-chain tx faster.
    this.api.speedUpDeposit(swap.id, hash).catch(() => {});

    return { hash };
  }

  async getDepositFeeEstimate(
    _options?: BridgeDepositOptions
  ): Promise<LayerSwapDepositFeeEstimation> {
    const [quote, sourceTxFee] = await Promise.all([
      this.api
        .getQuote({
          sourceNetwork: this.sourceNetwork,
          sourceToken: this.bridgeToken.symbol,
          destinationNetwork: this.destNetwork,
          destinationToken: this.bridgeToken.symbol,
          // LayerSwap treats `0` as "quote at the route minimum". Pass the
          // user's amount here once `BridgeInterface.getDepositFeeEstimate`
          // grows an `amount` arg, for an exact quote.
          amount: "0",
        })
        .catch((e: unknown) => {
          this.logger.debug(
            "[LayerSwapBridge] getDepositFeeEstimate (quote) failed:",
            e
          );
          return null;
        }),
      this.estimateSourceTxFee(),
    ]);

    const decimals = this.bridgeToken.decimals;
    const symbol = this.bridgeToken.symbol;
    const zeroEth = Amount.fromRaw(0n, 18, "ETH");
    const zeroBridgeToken = Amount.fromRaw(0n, decimals, symbol);

    return {
      // EthereumDepositFeeEstimation base fields — `l1Fee` is the user's
      // ETH gas for the source tx, matching Canonical/CCTP/OFT semantics.
      l1Fee: sourceTxFee.l1Fee,
      ...(sourceTxFee.l1FeeError !== undefined && {
        l1FeeError: sourceTxFee.l1FeeError,
      }),
      l2Fee: zeroEth,
      approvalFee: zeroEth,
      // LayerSwap-specific fees — bridge-token denominated, deducted from input.
      blockchainFee: quote
        ? Amount.parse(String(quote.blockchain_fee), decimals, symbol)
        : zeroBridgeToken,
      serviceFee: quote
        ? Amount.parse(String(quote.service_fee), decimals, symbol)
        : zeroBridgeToken,
      avgCompletionTime: quote?.avg_completion_time ?? "",
      ...(quote === null && {
        quoteError: FeeErrorCause.GENERIC_L2_FEE_ERROR,
      }),
    };
  }

  /**
   * Initiate a withdrawal from Starknet → Ethereum via LayerSwap.
   *
   * Creates a LayerSwap swap with source=Starknet, destination=Ethereum, and
   * executes the Starknet transfer into LayerSwap's deposit address.
   * LayerSwap auto-delivers the funds on Ethereum — no `completeWithdraw` step.
   */
  override async initiateWithdraw(
    recipient: ExternalAddress,
    amount: Amount,
    options?: InitiateBridgeWithdrawOptions
  ): Promise<Tx> {
    const starknetAddress = this.starknetWallet.address.toString();

    const response = await this.api.createSwap({
      sourceNetwork: this.destNetwork,
      sourceToken: this.bridgeToken.symbol,
      destinationNetwork: this.sourceNetwork,
      destinationToken: this.bridgeToken.symbol,
      amount: amount.toUnit(),
      destinationAddress: recipient.toString(),
      sourceAddress: starknetAddress,
      refundAddress: starknetAddress,
    });

    const swap = response.swap;
    const actions =
      response.deposit_actions.length > 0
        ? response.deposit_actions
        : await this.api.getDepositActions(swap.id, starknetAddress);
    const action = actions.find(
      (a) => a.network.name === this.destNetwork && a.type === "transfer"
    );

    if (!action) {
      throw new Error(
        `No transfer deposit action for swap "${swap.id}" on network "${this.destNetwork}".`
      );
    }

    const calls = this.buildStarknetTransferCalls(action);
    const tx = await this.starknetWallet.execute(calls, options);

    // Nudge LayerSwap to detect the Starknet tx faster. Non-critical — the
    // poller on their end picks it up regardless.
    this.api
      .speedUpDeposit(swap.id, normalizeLsTxHash(tx.hash, "starknet"))
      .catch(() => {});

    return tx;
  }

  async getInitiateWithdrawFeeEstimate(
    _options?: InitiateBridgeWithdrawOptions
  ): Promise<LayerSwapInitiateWithdrawFeeEstimation> {
    const dummyCalls = this.buildDummyStarknetTransferCalls();

    const [quote, l2] = await Promise.all([
      this.api
        .getQuote({
          sourceNetwork: this.destNetwork,
          sourceToken: this.bridgeToken.symbol,
          destinationNetwork: this.sourceNetwork,
          destinationToken: this.bridgeToken.symbol,
          amount: "0",
        })
        .catch((e: unknown) => {
          this.logger.debug(
            "[LayerSwapBridge] getInitiateWithdrawFeeEstimate (quote) failed:",
            e
          );
          return null;
        }),
      this.estimateStarknetFee(dummyCalls),
    ]);

    const decimals = this.bridgeToken.decimals;
    const symbol = this.bridgeToken.symbol;
    const zeroBridgeToken = Amount.fromRaw(0n, decimals, symbol);

    return {
      l2Fee: l2.fee,
      ...(l2.error !== undefined && { l2FeeError: l2.error }),
      blockchainFee: quote
        ? Amount.parse(String(quote.blockchain_fee), decimals, symbol)
        : zeroBridgeToken,
      serviceFee: quote
        ? Amount.parse(String(quote.service_fee), decimals, symbol)
        : zeroBridgeToken,
      avgCompletionTime: quote?.avg_completion_time ?? "",
      ...(quote === null && {
        quoteError: FeeErrorCause.GENERIC_L2_FEE_ERROR,
      }),
    };
  }

  /**
   * LayerSwap delivers funds automatically on the destination chain — the
   * user never calls `completeWithdraw`.
   */
  override async completeWithdraw(
    _recipient: ExternalAddress,
    _amount: Amount,
    _options?: CompleteBridgeWithdrawOptions
  ): Promise<ExternalTransactionResponse> {
    throw new Error(
      "LayerSwap withdrawals are delivered automatically — no completeWithdraw step is required."
    );
  }

  override async getCompleteWithdrawFeeEstimate(
    _amount: Amount,
    _recipient: ExternalAddress,
    _options?: CompleteBridgeWithdrawOptions
  ): Promise<EthereumCompleteWithdrawFeeEstimation> {
    throw new Error(
      "LayerSwap withdrawals are delivered automatically — no completion fee applies."
    );
  }

  // LayerSwap handles approvals within deposit actions.
  protected async getAllowanceSpender(): Promise<EthereumAddress | null> {
    return null;
  }

  // ============================================================
  // Private helpers
  // ============================================================

  /**
   * Estimate the user's ETH gas for the source-chain deposit tx.
   *
   * Builds a dummy self-transfer (native ETH) or ERC20 `transfer(self, 1)`
   * and calls `provider.estimateGas`. Falls back to a conservative static
   * gas ceiling × live gas price when the RPC estimate fails (e.g. the user
   * has zero source-token balance so the ERC20 transfer would revert).
   *
   * Mirrors the pattern in Canonical/CCTP/OFT without pulling a shared
   * helper into `EthereumBridge`.
   */
  private async estimateSourceTxFee(): Promise<{
    l1Fee: Amount;
    l1FeeError?: FeeErrorCause;
  }> {
    const isNative = this.token.isNativeEth();
    const fallbackGas = isNative
      ? NATIVE_DEPOSIT_FALLBACK_GAS
      : ERC20_DEPOSIT_FALLBACK_GAS;

    try {
      const [from, gasPrice] = await Promise.all([
        this.config.signer.getAddress(),
        this.getEthereumGasPrice(),
      ]);

      let tx: TransactionRequest;
      if (isNative) {
        tx = { to: from, value: 1n, from };
      } else {
        const contract = this.token.getContract();
        if (!contract) {
          return {
            l1Fee: this.ethAmount(fallbackGas * gasPrice),
            l1FeeError: FeeErrorCause.NO_TOKEN_CONTRACT,
          };
        }
        const populated = await contract
          .getFunction("transfer")
          .populateTransaction(from, 1n);
        tx = { ...populated, from };
      }

      try {
        const gasUnits = await this.config.provider.estimateGas(tx);
        return { l1Fee: this.ethAmount(gasUnits * gasPrice) };
      } catch (e) {
        this.logger.debug(
          "[LayerSwapBridge] estimateSourceTxFee (estimateGas) failed:",
          e
        );
        return {
          l1Fee: this.ethAmount(fallbackGas * gasPrice),
          l1FeeError: FeeErrorCause.GENERIC_L1_FEE_ERROR,
        };
      }
    } catch (e) {
      this.logger.debug(
        "[LayerSwapBridge] estimateSourceTxFee (gas price) failed:",
        e
      );
      return {
        l1Fee: this.ethAmount(0n),
        l1FeeError: FeeErrorCause.GENERIC_L1_FEE_ERROR,
      };
    }
  }

  /**
   * Parse LayerSwap's Starknet deposit action into executable calls.
   *
   * LayerSwap ships the full Starknet call(s) as a JSON string in `call_data`.
   * Their reference UI does `account.execute(JSON.parse(callData))` — so the
   * parsed value is either a single `Call` or `Call[]`.
   */
  private buildStarknetTransferCalls(action: LsDepositAction): Call[] {
    if (!action.call_data) {
      throw new Error(
        `Starknet deposit action (order ${action.order}) has no call_data.`
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(action.call_data);
    } catch (e) {
      throw new Error(
        `Failed to parse LayerSwap Starknet call_data as JSON: ${
          (e as Error).message
        }`
      );
    }

    const raw = (Array.isArray(parsed) ? parsed : [parsed]) as unknown[];
    if (raw.length === 0) {
      throw new Error(
        `LayerSwap returned no Starknet calls (order ${action.order}).`
      );
    }

    return raw.map((entry, i) => {
      if (
        typeof entry !== "object" ||
        entry === null ||
        typeof (entry as Call).contractAddress !== "string" ||
        typeof (entry as Call).entrypoint !== "string"
      ) {
        throw new Error(
          `LayerSwap Starknet call_data entry ${i} is missing required Call fields.`
        );
      }
      return entry as Call;
    });
  }

  private buildDummyStarknetTransferCalls(): Call[] {
    return [
      {
        contractAddress: this.bridgeToken.starknetAddress.toString(),
        entrypoint: "transfer",
        calldata: CallData.compile({
          recipient: DUMMY_SN_ADDRESS.toString(),
          amount: uint256.bnToUint256(1n),
        }),
      },
    ];
  }

  private async estimateStarknetFee(
    calls: Call[]
  ): Promise<{ fee: Amount; error?: FeeErrorCause }> {
    try {
      const estimate = await this.starknetWallet.estimateFee(calls);
      const isFri = estimate.unit === "FRI";
      return {
        fee: Amount.fromRaw(estimate.overall_fee, 18, isFri ? "STRK" : "ETH"),
      };
    } catch (e) {
      this.logger.debug("[LayerSwapBridge] estimateStarknetFee failed:", e);
      return {
        fee: Amount.fromRaw(0n, 18, "STRK"),
        error: FeeErrorCause.GENERIC_L2_FEE_ERROR,
      };
    }
  }

  private async executeEvmDepositAction(
    action: LsDepositAction
  ): Promise<ExternalTransactionResponse> {
    if (!action.to_address) {
      throw new Error(
        `Deposit action (order ${action.order}) has no to_address.`
      );
    }

    // Native chain currency has `token.contract === null`. Native deposits
    // can still ship `call_data` (a watcher contract that records the
    // deposit) and that call needs `msg.value`. ERC20 deposits ship
    // `call_data = transfer(depositAddr, amount)` to a non-payable function
    // and must use value=0.
    const isNative = !action.token.contract;
    const tx: TransactionRequest = {
      to: action.to_address,
      value: isNative ? BigInt(action.amount_in_base_units) : 0n,
      ...(action.call_data && { data: action.call_data }),
      ...(action.gas_limit && { gasLimit: BigInt(action.gas_limit) }),
    };

    const response = await this.execute(tx);
    const receipt = await response.wait();
    if (!receipt?.status) {
      throw new Error(
        `LayerSwap deposit action (order ${action.order}) failed on-chain.`
      );
    }

    return { hash: response.hash };
  }
}
