import {
  type Address,
  Amount,
  type EthereumAddress,
  EthereumBridgeToken,
  type ExternalAddress,
  type ExternalTransactionResponse,
  fromAddress,
} from "@/types";
import type {
  BridgeDepositOptions,
  CCTPInitiateWithdrawBridgeOptions,
  CompleteBridgeWithdrawOptions,
  InitiateBridgeWithdrawOptions,
} from "@/bridge/types/BridgeInterface";
import type {
  CCTPDepositFeeEstimation,
  CCTPInitiateWithdrawFeeEstimation,
  EthereumCompleteWithdrawFeeEstimation,
  EthereumWalletConfig,
} from "@/bridge";
import { ERC20EthereumToken } from "@/bridge/ethereum/EtherToken";
import { getAddress, Interface, type TransactionRequest } from "ethers";
import { FeeErrorCause } from "@/types/errors";
import { BridgeDirection, CCTPFees } from "@/bridge/ethereum/cctp/CCTPFees";
import {
  CCTP_COMPLETE_WITHDRAW_OPTIONS_ERROR_MESSAGE,
  EMPTY_DESTINATION_CALLER,
  ETHEREUM_DOMAIN_ID,
  FALLBACK_COMPLETE_WITHDRAW_GAS,
  getCircleApiBaseUrl,
  getFinalityThreshold,
  getMessageTransmitter,
  getTokenMessenger,
  REATTESTATION_POLL_ATTEMPTS,
  REATTESTATION_POLL_INTERVAL_MS,
  REATTESTATION_SAFETY_BLOCK_THRESHOLD,
  STARKNET_DOMAIN_ID,
} from "@/bridge/ethereum/cctp/constants";
import { EthereumBridge } from "@/bridge/ethereum/EthereumBridge";
import { fromEthereumAddress } from "@/connect/ethersRuntime";
import type { Tx } from "@/tx";
import { cairo, type Call, CallData, uint256 } from "starknet";
import type { WalletInterface } from "@/wallet";
import { type StarkZapLogger } from "@/logger";

export class CCTPBridge extends EthereumBridge {
  private static readonly MAINNET_TOKEN_MESSENGER = fromEthereumAddress(
    "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
    { getAddress }
  );
  private static readonly SEPOLIA_TOKEN_MESSENGER = fromEthereumAddress(
    "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    { getAddress }
  );

  private static DEFAULT_CCTP_DEPOSIT_GAS = 104_581n;

  private static TOKEN_MESSENGER_INTERFACE = new Interface([
    "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold)",
  ]);

  private static MESSAGE_TRANSMITTER_INTERFACE = new Interface([
    "function receiveMessage(bytes message, bytes attestation)",
  ]);

  private static readonly DUMMY_SN_ADDRESS = fromAddress(
    "0x0000000000000000000000000000000000000000000000000000000000000001"
  );

  private static readonly ZERO_ETH = Amount.fromRaw(0n, 18, "ETH");

  constructor(
    bridgeToken: EthereumBridgeToken,
    config: EthereumWalletConfig,
    starknetWallet: WalletInterface,
    logger: StarkZapLogger,
    private readonly cctpFees: CCTPFees
  ) {
    super(bridgeToken, config, starknetWallet, logger);
  }

  async deposit(
    recipient: Address,
    amount: Amount,
    options?: BridgeDepositOptions
  ): Promise<ExternalTransactionResponse> {
    await this.approveSpendingOf(amount);

    const txRequest = await this.createDepositForBurnTransaction(
      recipient,
      amount,
      undefined,
      options?.fastTransfer
    );

    const txResponse = await this.execute(txRequest);

    this.clearCachedAllowance();

    return { hash: txResponse.hash };
  }

  async getDepositFeeEstimate(
    options?: BridgeDepositOptions
  ): Promise<CCTPDepositFeeEstimation> {
    const fastTransfer = options?.fastTransfer;
    const minimalAmount = this.usdcAmount(2n);
    const [allowance, approvalFeeData, feeData, minimumFeeBps] =
      await Promise.all([
        this.getAllowance(),
        this.estimateApprovalFee(),
        this.config.provider.getFeeData(),
        this.cctpFees.getMinimumFeeBps(
          BridgeDirection.DEPOSIT_TO_STARKNET,
          this.starknetWallet.getChainId(),
          fastTransfer
        ),
      ]);

    const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n;
    const defaultL1Fee = this.ethAmount(
      CCTPBridge.DEFAULT_CCTP_DEPOSIT_GAS * gasPrice
    );
    if (!allowance || allowance.lt(minimalAmount)) {
      return {
        l1Fee: defaultL1Fee,
        l2Fee: CCTPBridge.ZERO_ETH,
        fastTransferBpFee: minimumFeeBps,
        ...approvalFeeData,
      };
    } else {
      const txRequest = await this.createDepositForBurnTransaction(
        CCTPBridge.DUMMY_SN_ADDRESS,
        minimalAmount,
        minimumFeeBps,
        fastTransfer
      );

      try {
        const gasEstimate = await this.config.signer.estimateGas(txRequest);

        const l1Fee = gasEstimate * gasPrice;
        return {
          l1Fee: this.ethAmount(l1Fee),
          l2Fee: CCTPBridge.ZERO_ETH,
          fastTransferBpFee: minimumFeeBps,
          ...approvalFeeData,
        };
      } catch (e) {
        this.logger.debug(
          "[CCTPBridge] getDepositFeeEstimate (L1 gas) failed:",
          e
        );
        return {
          l1Fee: defaultL1Fee,
          l1FeeError: FeeErrorCause.GENERIC_L1_FEE_ERROR,
          l2Fee: CCTPBridge.ZERO_ETH,
          fastTransferBpFee: minimumFeeBps,
          ...approvalFeeData,
        };
      }
    }
  }

  override async initiateWithdraw(
    recipient: EthereumAddress,
    amount: Amount,
    options?: InitiateBridgeWithdrawOptions
  ): Promise<Tx> {
    const { fastTransfer } = this.resolveCCTPInitiateOptions(options);
    const calls = await this.buildInitiateWithdrawCalls(
      recipient,
      amount,
      fastTransfer
    );
    return this.starknetWallet.execute(calls, options);
  }

  async getInitiateWithdrawFeeEstimate(
    options?: InitiateBridgeWithdrawOptions
  ): Promise<CCTPInitiateWithdrawFeeEstimation> {
    const { fastTransfer } = this.resolveCCTPInitiateOptions(options);

    const [calls, fastTransferBpFee] = await Promise.all([
      this.buildInitiateWithdrawCalls(
        fromEthereumAddress("0x0000000000000000000000000000000000000001", {
          getAddress,
        }),
        await this.token.amount(1n),
        fastTransfer
      ),
      this.cctpFees.getMinimumFeeBps(
        BridgeDirection.WITHDRAW_FROM_STARKNET,
        this.starknetWallet.getChainId(),
        fastTransfer
      ),
    ]);

    try {
      const estimate = await this.starknetWallet.estimateFee(calls);
      const isFri = estimate.unit === "FRI";
      return {
        l2Fee: Amount.fromRaw(estimate.overall_fee, 18, isFri ? "STRK" : "ETH"),
        fastTransferBpFee,
      };
    } catch (e) {
      this.logger.debug(
        "[CCTPBridge] getInitiateWithdrawFeeEstimate (L2 fee) failed:",
        e
      );
      return {
        l2Fee: Amount.fromRaw(0n, 18, "STRK"),
        l2FeeError: FeeErrorCause.GENERIC_L2_FEE_ERROR,
        fastTransferBpFee,
      };
    }
  }

  /**
   * @throws {Error} Message {@link CCTP_COMPLETE_WITHDRAW_OPTIONS_ERROR_MESSAGE}
   *   when `options` is missing or not `{ protocol: "cctp", ... }` with attestation data.
   */
  async completeWithdraw(
    _recipient: ExternalAddress,
    _amount: Amount,
    options?: CompleteBridgeWithdrawOptions
  ): Promise<ExternalTransactionResponse> {
    if (!options || options.protocol !== "cctp") {
      throw new Error(CCTP_COMPLETE_WITHDRAW_OPTIONS_ERROR_MESSAGE);
    }

    const { attestation, message, expirationBlock, nonce } = options;

    if (nonce && (await this.requiresReattestation(expirationBlock))) {
      const result = await this.waitForReattestation(nonce);
      if (
        result.status === "complete" &&
        result.attestation &&
        result.message
      ) {
        return this.execute({
          to: getMessageTransmitter(
            this.starknetWallet.getChainId()
          ).toString(),
          data: CCTPBridge.MESSAGE_TRANSMITTER_INTERFACE.encodeFunctionData(
            "receiveMessage",
            [result.message, result.attestation]
          ),
        }).then((r) => ({ hash: r.hash }));
      }
      throw new Error("CCTP re-attestation failed. Try again later.");
    }

    const calldata =
      CCTPBridge.MESSAGE_TRANSMITTER_INTERFACE.encodeFunctionData(
        "receiveMessage",
        [message, attestation]
      );

    const response = await this.execute({
      to: getMessageTransmitter(this.starknetWallet.getChainId()).toString(),
      data: calldata,
    });

    return { hash: response.hash };
  }

  /**
   * @throws {Error} Message {@link CCTP_COMPLETE_WITHDRAW_OPTIONS_ERROR_MESSAGE}
   *   when options are missing or not valid CCTP completion options (needed to simulate
   *   `receiveMessage`).
   */
  async getCompleteWithdrawFeeEstimate(
    _amount: Amount,
    _recipient: ExternalAddress,
    options?: CompleteBridgeWithdrawOptions
  ): Promise<EthereumCompleteWithdrawFeeEstimation> {
    if (options?.protocol !== "cctp") {
      throw new Error(CCTP_COMPLETE_WITHDRAW_OPTIONS_ERROR_MESSAGE);
    }

    try {
      const gasPrice = await this.getEthereumGasPrice();

      const calldata =
        CCTPBridge.MESSAGE_TRANSMITTER_INTERFACE.encodeFunctionData(
          "receiveMessage",
          [options.message, options.attestation]
        );
      try {
        const gasUnits = await this.config.provider.estimateGas({
          to: getMessageTransmitter(
            this.starknetWallet.getChainId()
          ).toString(),
          data: calldata,
        });
        return { l1Fee: this.ethAmount(gasUnits * gasPrice) };
      } catch {
        // fall through to fallback
      }

      return {
        l1Fee: this.ethAmount(FALLBACK_COMPLETE_WITHDRAW_GAS * gasPrice),
      };
    } catch (e) {
      this.logger.debug(
        "[CCTPBridge] getCompleteWithdrawFeeEstimate failed:",
        e
      );
      return {
        l1Fee: this.ethAmount(0n),
        l1FeeError: FeeErrorCause.GENERIC_L1_FEE_ERROR,
      };
    }
  }

  protected getAllowanceSpender(): Promise<EthereumAddress> {
    return Promise.resolve(
      this.starknetWallet.getChainId().isMainnet()
        ? CCTPBridge.MAINNET_TOKEN_MESSENGER
        : CCTPBridge.SEPOLIA_TOKEN_MESSENGER
    );
  }

  protected override async getEthereumGasPrice(): Promise<bigint> {
    const feeData = await this.config.provider.getFeeData();
    return feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n;
  }

  private usdcAmount(value: bigint): Amount {
    return Amount.fromRaw(value, 6, "USDC");
  }

  private async getL2Allowance(spender: Address): Promise<bigint> {
    const result = await this.starknetWallet.callContract({
      contractAddress: this.bridgeToken.starknetAddress.toString(),
      entrypoint: "allowance",
      calldata: [this.starknetWallet.address.toString(), spender.toString()],
    });
    return uint256.uint256ToBN({
      low: result[0] ?? "0x0",
      high: result[1] ?? "0x0",
    });
  }

  private buildL2ApproveCall(spender: string, amount: Amount): Call {
    return {
      contractAddress: this.bridgeToken.starknetAddress.toString(),
      entrypoint: "approve",
      calldata: CallData.compile({
        spender,
        amount: uint256.bnToUint256(amount.toBase()),
      }),
    };
  }

  private async buildDepositForBurnCall(
    recipient: EthereumAddress,
    amount: Amount,
    fastTransfer?: boolean
  ): Promise<Call> {
    const feeBps = await this.cctpFees.getMinimumFeeBps(
      BridgeDirection.WITHDRAW_FROM_STARKNET,
      this.starknetWallet.getChainId(),
      fastTransfer
    );
    const maxFee = this.calculateMaxFee(amount, feeBps);

    return {
      contractAddress: getTokenMessenger(this.starknetWallet.getChainId()),
      entrypoint: "deposit_for_burn",
      calldata: CallData.compile({
        amount: uint256.bnToUint256(amount.toBase()),
        destination_domain: ETHEREUM_DOMAIN_ID,
        mint_recipient: cairo.uint256(recipient.toString()),
        burn_token: this.bridgeToken.starknetAddress.toString(),
        destination_caller: cairo.uint256(EMPTY_DESTINATION_CALLER),
        max_fee: uint256.bnToUint256(maxFee.toBase()),
        min_finality_threshold: getFinalityThreshold(fastTransfer),
      }),
    };
  }

  private async buildInitiateWithdrawCalls(
    recipient: EthereumAddress,
    amount: Amount,
    fastTransfer?: boolean
  ): Promise<Call[]> {
    const l2TokenMessenger = getTokenMessenger(
      this.starknetWallet.getChainId()
    );
    const allowance = await this.getL2Allowance(l2TokenMessenger);

    const calls: Call[] = [];

    if (allowance < amount.toBase()) {
      calls.push(this.buildL2ApproveCall(l2TokenMessenger, amount));
    }

    calls.push(
      await this.buildDepositForBurnCall(recipient, amount, fastTransfer)
    );

    return calls;
  }

  private async createDepositForBurnTransaction(
    recipient: Address,
    amount: Amount,
    fastTransferFeeBps?: number,
    fastTransfer?: boolean
  ): Promise<TransactionRequest> {
    const usdcToken = this.token as ERC20EthereumToken;
    const usdcAddress = await usdcToken.getAddress();
    const feeBps =
      fastTransferFeeBps ??
      (await this.cctpFees.getMinimumFeeBps(
        BridgeDirection.DEPOSIT_TO_STARKNET,
        this.starknetWallet.getChainId(),
        fastTransfer
      ));
    const maxFee = this.calculateMaxFee(amount, feeBps);
    const calldata = CCTPBridge.TOKEN_MESSENGER_INTERFACE.encodeFunctionData(
      "depositForBurn",
      [
        amount.toBase(),
        STARKNET_DOMAIN_ID,
        recipient,
        usdcAddress,
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        maxFee.toBase(),
        getFinalityThreshold(fastTransfer),
      ]
    );

    return {
      to: await this.getAllowanceSpender(),
      data: calldata,
    };
  }

  private calculateMaxFee(amount: Amount, feeBasisPoints: number): Amount {
    const numerator = amount.toBase() * BigInt(feeBasisPoints);
    const divisor = 10000n; // Basis points

    // Round up by adding (divisor - 1) before dividing
    const result = (numerator + divisor - 1n) / divisor;
    return this.usdcAmount(result);
  }

  private resolveCCTPInitiateOptions(
    options?: InitiateBridgeWithdrawOptions
  ): CCTPInitiateWithdrawBridgeOptions {
    if (options && "protocol" in options) {
      if (options.protocol !== "cctp") {
        throw new Error(
          "Only ExecuteOptions & CCTPInitiateWithdrawBridgeOptions are valid in a CCTP Bridge"
        );
      }
      return options;
    }
    return { protocol: "cctp" };
  }

  private async waitForReattestation(nonce: string): Promise<{
    status: "complete" | "failed";
    attestation?: string;
    message?: string;
  }> {
    const baseUrl = getCircleApiBaseUrl(this.starknetWallet.getChainId());

    try {
      await fetch(`${baseUrl}/v2/reattest/${nonce}`, {
        method: "POST",
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // might already be re-attested; ignore and proceed to poll
    }

    for (let i = 0; i < REATTESTATION_POLL_ATTEMPTS; i++) {
      await new Promise((resolve) =>
        setTimeout(resolve, REATTESTATION_POLL_INTERVAL_MS)
      );

      try {
        const response = await fetch(
          `${baseUrl}/v2/messages/${STARKNET_DOMAIN_ID}?nonce=${nonce}`,
          { signal: AbortSignal.timeout(10_000) }
        );
        if (!response.ok) continue;

        const data = (await response.json()) as {
          messages: {
            status: string;
            attestation: string;
            message: string | null;
          }[];
        };

        const msg = data.messages[0];
        if (msg?.status === "complete" && msg.attestation !== "PENDING") {
          return {
            status: "complete",
            attestation: msg.attestation,
            ...(msg.message !== null && { message: msg.message }),
          };
        }
      } catch {
        // transient network error — retry
      }
    }

    return { status: "failed" };
  }

  private async requiresReattestation(
    expirationBlock?: number
  ): Promise<boolean> {
    if (!expirationBlock) {
      return false;
    }

    const blockNumber = await this.config.provider.getBlockNumber();

    return (
      blockNumber >= expirationBlock - REATTESTATION_SAFETY_BLOCK_THRESHOLD
    );
  }
}
