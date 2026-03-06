import type { BridgeInterface } from "@/bridge/types/BridgeInterface";
import {
  type Address,
  Amount,
  type EthereumAddress,
  EthereumBridgeToken,
  fromEthereumAddress,
} from "@/types";
import type { EthereumTokenInterface } from "@/bridge/ethereum/EthereumToken";
import type { EthereumWalletConfig } from "@/bridge/ethereum/types";
import {
  type ContractTransaction,
  ContractTransactionReceipt,
  type ContractTransactionResponse,
  isError,
} from "ethers";
import {
  StarkzapTransactionError,
  TransactionErrorCause,
} from "@/types/errors";

export abstract class EthereumBridge implements BridgeInterface<EthereumBridgeToken> {
  public static readonly ALLOWANCE_CACHE_TTL = 60_000;
  private allowanceCache: {
    current: Amount | null;
    timestamp: number;
  };

  constructor(
    private readonly token: EthereumTokenInterface,
    private readonly config: EthereumWalletConfig
  ) {
    this.allowanceCache = {
      current: null,
      timestamp: 0,
    };
  }

  async getAvailableDepositBalance(account: EthereumAddress): Promise<Amount> {
    return this.token.balanceOf(account);
  }

  async getAllowance(): Promise<Amount | null> {
    const allowanceSpender = await this.getAllowanceSpender();
    if (!allowanceSpender) {
      return null;
    }

    if (
      Date.now() - this.allowanceCache.timestamp >
      EthereumBridge.ALLOWANCE_CACHE_TTL
    ) {
      const signerAddress = await this.config.signer.getAddress();
      const allowance = await this.token.allowance(
        fromEthereumAddress(signerAddress),
        allowanceSpender
      );

      this.setCachedAllowance(allowance);
    }

    return this.allowanceCache.current;
  }

  async deposit(
    amount: Amount,
    _l2Recipient: Address
  ): Promise<ContractTransactionResponse> {
    await this.approveSpendingOf(amount);

    return Promise.reject(undefined);
  }

  protected async approveSpendingOf(amount: Amount): Promise<void> {
    const spender = await this.getAllowanceSpender();
    if (!spender) {
      return;
    }

    const allowance = await this.getAllowance();
    if (!allowance) {
      console.log("No allowance, skip approval");
      return;
    }

    if (allowance.lt(amount)) {
      // Send TX
      const tx = await this.getApprovalTransaction(spender, allowance);
      if (!tx) {
        return;
      }

      const response = await this.execute(tx);
      const receipt = await response.wait();
      if (!receipt?.status) {
        throw new StarkzapTransactionError(
          TransactionErrorCause.APPROVE_FAILED
        );
      }

      await this.updateAllowanceFromReceipt(receipt);
    } else {
      // TODO
    }
  }

  protected async getApprovalTransaction(
    spender: EthereumAddress,
    amount: Amount
  ): Promise<ContractTransaction | null> {
    const contract = this.token.getContract(this.config.signer);
    if (!contract) {
      return null;
    }

    return await contract
      .getFunction("approve")
      .populateTransaction(spender, amount.toBase());
  }

  protected async execute(
    tx: ContractTransaction
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

  ///// ABSTRACT
  protected abstract getAllowanceSpender(): Promise<EthereumAddress | null>;

  ///// PRIVATE
  private setCachedAllowance(newValue: Amount | null) {
    this.allowanceCache = {
      current: newValue,
      timestamp: Date.now(),
    };
  }

  private clearCachedAllowance() {
    this.allowanceCache.timestamp = -1;
  }

  private async updateAllowanceFromReceipt(
    receipt: ContractTransactionReceipt
  ) {
    console.log("UPDATE ALLOWANCE RECEIPT", receipt.logs, receipt.toJSON());
    const tokenInterface = this.token.getContract()?.interface;
    if (!tokenInterface || !receipt.logs) return;

    const approvalLog = receipt.logs.find((log) => {
      const parsedLog = tokenInterface.parseLog(log);
      if (parsedLog?.name === "Approval" && parsedLog.args) {
        const approvedAmount = parsedLog.args.value;
        return typeof approvedAmount === "bigint";
      }

      // TODO check that
      return;
    });

    if (approvalLog) {
      const newAllowance: bigint =
        tokenInterface.parseLog(approvalLog)!.args.value;
      const amount = await this.token.amount(newAllowance);
      this.setCachedAllowance(amount);
    } else {
      this.clearCachedAllowance();
    }
  }
}
