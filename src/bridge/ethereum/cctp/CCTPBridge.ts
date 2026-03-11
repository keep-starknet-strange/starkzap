import {
  type Address,
  Amount,
  type EthereumAddress,
  EthereumBridgeToken,
  fromAddress,
  fromEthereumAddress,
} from "@/types";
import type {
  BridgeDepositOptions,
  BridgeInterface,
} from "@/bridge/types/BridgeInterface";
import type {
  ApprovalFeeEstimation,
  CCTPDepositFeeEstimation,
  EthereumWalletConfig,
} from "@/bridge";
import type { WalletInterface } from "@/wallet";
import {
  ERC20EthereumToken,
  intoEthereumToken,
} from "@/bridge/ethereum/EtherToken";
import {
  type ContractTransaction,
  type ContractTransactionReceipt,
  type ContractTransactionResponse,
  Interface,
  isError,
  type TransactionRequest,
  type TransactionResponse,
} from "ethers";
import {
  FeeErrorCause,
  StarkzapTransactionError,
  TransactionErrorCause,
} from "@/types/errors";
import { BridgeDirection, CCTPFees } from "@/bridge/ethereum/cctp/CCTPFees";
import {
  getFinalityThreshold,
  STARKNET_DOMAIN_ID,
} from "@/bridge/ethereum/cctp/constants";
import { EthereumBridge } from "@/bridge/ethereum/EthereumBridge";

export class CCTPBridge implements BridgeInterface<
  EthereumAddress,
  TransactionResponse,
  CCTPDepositFeeEstimation
> {
  private static readonly MAINNET_TOKEN_MESSENGER = fromEthereumAddress(
    "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d"
  );
  private static readonly SEPOLIA_TOKEN_MESSENGER = fromEthereumAddress(
    "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA"
  );

  private static DEFAULT_CCTP_DEPOSIT_GAS = 104_581n;

  private static TOKEN_MESSENGER_INTERFACE = new Interface([
    "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold)",
  ]);

  private static readonly DUMMY_SN_ADDRESS = fromAddress(
    "0x0000000000000000000000000000000000000000000000000000000000000001"
  );

  private static readonly ZERO_ETH = Amount.fromRaw(0n, 18, "ETH");

  private readonly usdcToken: ERC20EthereumToken;
  private readonly cctpFees = CCTPFees.getInstance();

  private allowanceCache: {
    current: Amount | null;
    timestamp: number;
  };

  constructor(
    private readonly bridgeToken: EthereumBridgeToken,
    private readonly config: EthereumWalletConfig,
    readonly starknetWallet: WalletInterface
  ) {
    this.usdcToken = intoEthereumToken(
      bridgeToken,
      config
    ) as ERC20EthereumToken;
    this.allowanceCache = {
      current: null,
      timestamp: 0,
    };
  }

  async deposit(
    recipient: Address,
    amount: Amount,
    options?: BridgeDepositOptions
  ): Promise<TransactionResponse> {
    await this.approveSpendingOf(amount);

    const txRequest = await this.createDepositForBurnTransaction(
      recipient,
      amount,
      undefined,
      options?.fastTransfer
    );

    const txResponse = await this.execute(txRequest);

    this.clearCachedAllowance();

    return txResponse;
  }

  async getAllowance(): Promise<Amount | null> {
    const allowanceSpender = this.getAllowanceSpender();
    if (!allowanceSpender) {
      return null;
    }

    if (
      Date.now() - this.allowanceCache.timestamp >
      EthereumBridge.ALLOWANCE_CACHE_TTL
    ) {
      const signerAddress = await this.config.signer.getAddress();
      const allowance = await this.usdcToken.allowance(
        fromEthereumAddress(signerAddress),
        allowanceSpender
      );
      this.setCachedAllowance(allowance);
    }

    return this.allowanceCache.current;
  }

  async getAvailableDepositBalance(account: EthereumAddress): Promise<Amount> {
    return this.usdcToken.balanceOf(account);
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

  ///// Private

  private getAllowanceSpender(): EthereumAddress {
    if (this.starknetWallet.getChainId().isMainnet()) {
      return CCTPBridge.MAINNET_TOKEN_MESSENGER;
    } else {
      return CCTPBridge.SEPOLIA_TOKEN_MESSENGER;
    }
  }

  // DUB
  protected async approveSpendingOf(amount: Amount): Promise<void> {
    const spender = this.getAllowanceSpender();
    // TODO this is not null ever
    if (!spender) {
      return;
    }

    const allowance = await this.getAllowance();
    if (!allowance) {
      return;
    }

    if (!allowance.lt(amount)) {
      return;
    }

    const tx = await this.usdcToken.approve(
      spender,
      amount,
      this.config.signer
    );
    if (!tx) {
      return;
    }

    const response = await this.execute(tx);
    const receipt = await response.wait();
    if (!receipt?.status) {
      throw new StarkzapTransactionError(TransactionErrorCause.APPROVE_FAILED);
    }

    await this.updateAllowanceFromReceipt(receipt);
  }

  // DUB
  protected async execute(
    tx: TransactionRequest
  ): Promise<ContractTransactionResponse> {
    try {
      return (await this.config.signer.sendTransaction(
        tx
      )) as ContractTransactionResponse;
    } catch (e) {
      if (isError(e, "ACTION_REJECTED")) {
        throw new StarkzapTransactionError(TransactionErrorCause.USER_REJECTED);
      }

      if (isError(e, "INSUFFICIENT_FUNDS")) {
        throw new StarkzapTransactionError(
          TransactionErrorCause.INSUFFICIENT_BALANCE
        );
      }

      // TODO be more specific with other ethers errors
      throw e;
    }
  }

  // DUB
  private async estimateApprovalFee(): Promise<ApprovalFeeEstimation> {
    const contract = this.usdcToken.getContract();
    if (!contract) {
      return {
        approvalFee: this.ethAmount(0n),
        approvalFeeError: FeeErrorCause.NO_TOKEN_CONTRACT,
      };
    }

    try {
      const approvalTransaction = await this.getApprovalTransaction(
        this.getAllowanceSpender(),
        await this.usdcToken.amount(2n)
      );
      if (!approvalTransaction) {
        return {
          approvalFee: this.ethAmount(0n),
          approvalFeeError: FeeErrorCause.NO_TOKEN_CONTRACT,
        };
      }

      const [approvalGasRequirement, gasPrice] = await Promise.all([
        this.config.signer.estimateGas(approvalTransaction),
        this.getEthereumGasPrice(),
      ]);

      const approvalFee: bigint = approvalGasRequirement * gasPrice;
      return { approvalFee: this.ethAmount(approvalFee) };
    } catch {
      return {
        approvalFee: this.ethAmount(0n),
        approvalFeeError: FeeErrorCause.APPROVAL_FEE_ERROR,
      };
    }
  }

  // DUB
  protected async getApprovalTransaction(
    spender: EthereumAddress,
    amount: Amount
  ): Promise<ContractTransaction | null> {
    const contract = this.usdcToken.getContract(this.config.signer);
    if (!contract) {
      return null;
    }

    return await contract
      .getFunction("approve")
      .populateTransaction(spender, amount.toBase());
  }

  // DUB + Overridden
  private async getEthereumGasPrice(): Promise<bigint> {
    const feeData = await this.config.provider.getFeeData();

    return feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n;
  }

  // DUB
  private ethAmount(value: bigint): Amount {
    return Amount.fromRaw(value, 18, "ETH");
  }

  // DUB
  private setCachedAllowance(newValue: Amount | null) {
    this.allowanceCache = {
      current: newValue,
      timestamp: Date.now(),
    };
  }

  // DUB
  private clearCachedAllowance() {
    this.allowanceCache.timestamp = -1;
  }

  // DUB
  private async updateAllowanceFromReceipt(
    receipt: ContractTransactionReceipt
  ) {
    // TODO remove this log later
    console.log("UPDATE ALLOWANCE RECEIPT", receipt.logs, receipt.toJSON());
    const tokenInterface = this.usdcToken.getContract()?.interface;
    if (!tokenInterface || !receipt.logs) return;

    const approvalLog = receipt.logs.find((log) => {
      const parsedLog = tokenInterface.parseLog(log);
      return (
        parsedLog?.name === "Approval" &&
        typeof parsedLog.args?.value === "bigint"
      );
    });

    if (approvalLog) {
      const newAllowance: bigint =
        tokenInterface.parseLog(approvalLog)!.args.value;
      const amount = await this.usdcToken.amount(newAllowance);
      this.setCachedAllowance(amount);
    } else {
      this.clearCachedAllowance();
    }
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
    const usdcAddress = await this.usdcToken.getAddress();
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
      to: this.getAllowanceSpender(),
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
