import {
  type Address,
  Amount,
  type EthereumAddress,
  type ExternalTransactionResponse,
  fromAddress,
} from "@/types";
import type { BridgeDepositOptions } from "@/bridge/types/BridgeInterface";
import type { CCTPDepositFeeEstimation } from "@/bridge";
import { ERC20EthereumToken } from "@/bridge/ethereum/EtherToken";
import { getAddress, Interface, type TransactionRequest } from "ethers";
import { FeeErrorCause } from "@/types/errors";
import { BridgeDirection, CCTPFees } from "@/bridge/ethereum/cctp/CCTPFees";
import {
  getFinalityThreshold,
  STARKNET_DOMAIN_ID,
} from "@/bridge/ethereum/cctp/constants";
import { EthereumBridge } from "@/bridge/ethereum/EthereumBridge";
import { fromEthereumAddress } from "@/connect/ethersRuntime";

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

  private static readonly DUMMY_SN_ADDRESS = fromAddress(
    "0x0000000000000000000000000000000000000000000000000000000000000001"
  );

  private static readonly ZERO_ETH = Amount.fromRaw(0n, 18, "ETH");

  private readonly cctpFees = CCTPFees.getInstance();

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
      } catch {
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
}
