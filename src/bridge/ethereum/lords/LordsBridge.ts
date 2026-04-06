import { CanonicalEthereumBridge } from "@/bridge/ethereum/canonical/CanonicalEthereumBridge";
import { ethereumAddress } from "@/bridge/ethereum/EtherToken";
import type { EthereumTransactionDetails } from "@/bridge/ethereum/types";
import type { Address, ExternalAddress } from "@/types";
import { Amount, EthereumBridgeToken } from "@/types";
import type { EthereumWalletConfig } from "@/bridge/ethereum/types";
import type { WalletInterface } from "@/wallet";
import { type Call, CallData, RPC, uint256 } from "starknet";
import { FeeErrorCause } from "@/types/errors";
import LORDS_BRIDGE_ABI from "@/abi/ethereum/lordsBridge.json";
import { AutoWithdrawFeesHandler } from "@/bridge/utils/auto-withdraw-fees-handler";
import type { StarkZapLogger } from "@/logger";

export class LordsBridge extends CanonicalEthereumBridge {
  constructor(
    bridgeToken: EthereumBridgeToken,
    config: EthereumWalletConfig,
    starknetWallet: WalletInterface,
    autoWithdrawFeesHandler: AutoWithdrawFeesHandler,
    logger: StarkZapLogger
  ) {
    if (bridgeToken.id !== "lords") {
      throw new Error(
        `LordsBridge must be instantiated with the LORDS token (got "${bridgeToken.id}").`
      );
    }
    super(
      bridgeToken,
      config,
      starknetWallet,
      autoWithdrawFeesHandler,
      logger,
      LORDS_BRIDGE_ABI
    );
  }

  /**
   * The LORDS L1 bridge has a single-token contract with a different deposit
   * signature: `deposit(uint256 amount, uint256 l2Recipient, uint256 fee)`.
   * Unlike the canonical bridge's `deposit(address token, uint256 amount,
   * uint256 l2Recipient)`, the token address is implicit (one bridge per
   * token) and a fee argument (1 wei) is passed instead. No ETH value is
   * attached to the transaction.
   */
  protected override async prepareDepositTransactionDetails(
    recipient: Address,
    amount: Amount
  ): Promise<EthereumTransactionDetails> {
    const signer = await this.config.signer.getAddress();
    return {
      method: "deposit(uint256,uint256,uint256)",
      args: [amount.toBase().toString(), recipient.toString(), "1"],
      transaction: {
        from: signer,
      },
    };
  }

  /**
   * The LORDS L2 bridge uses `handle_deposit` with a 3-element payload
   * `[recipient, amount_low, amount_high]`, whereas the canonical bridge uses
   * `handle_token_deposit` with a 5-element payload that also includes the L1
   * token address and the sender address.
   */
  protected override async estimateL1ToL2MessageFee(
    recipient: Address,
    amount: Amount
  ): Promise<{ fee: Amount; l2FeeError?: FeeErrorCause }> {
    try {
      const { low, high } = uint256.bnToUint256(amount.toBase());
      const l1Message: RPC.RPCSPEC010.L1Message = {
        from_address: await ethereumAddress(this.bridge),
        to_address: this.bridgeToken.starknetBridge.toString(),
        entry_point_selector: "handle_deposit",
        payload: [recipient.toString(), low.toString(), high.toString()],
      };

      const { overall_fee, unit } = await this.starknetWallet
        .getProvider()
        .estimateMessageFee(l1Message);

      const fee = Amount.fromRaw(
        overall_fee,
        18,
        unit === "WEI" ? "ETH" : "STRK"
      );

      return { fee };
    } catch {
      return {
        fee: Amount.fromRaw(0n, 18, "ETH"),
        l2FeeError: FeeErrorCause.GENERIC_L2_FEE_ERROR,
      };
    }
  }

  /**
   * `prepareDepositTransactionDetails` (the only call site for now) is
   * completely overridden, but it is a good practise to maintain that no eth
   * are spent.
   */
  protected override async getEthDepositValue(
    _recipient: Address,
    _amount: Amount
  ): Promise<Amount> {
    return this.ethAmount(0n);
  }

  /**
   * The LORDS L2 bridge uses a single-token `initiate_withdrawal` entrypoint
   * with calldata `[l1Recipient, amount_low, amount_high]` — no token address
   * prefix, unlike the canonical `initiate_token_withdraw`.
   */
  protected override buildInitiateWithdrawCall(
    recipient: string,
    amount: Amount
  ): Call {
    return {
      contractAddress: this.bridgeToken.starknetBridge.toString(),
      entrypoint: "initiate_withdrawal",
      calldata: CallData.compile({
        l1Recipient: recipient,
        amount: uint256.bnToUint256(amount.toBase()),
      }),
    };
  }

  /**
   * The LORDS L1 bridge uses `withdraw(uint256 amount, address recipient)`
   * instead of the canonical `withdraw(address token, uint256 amount, address recipient)`.
   * The token address is implicit (one bridge per token).
   */
  protected override async buildCompleteWithdrawCall(
    recipient: ExternalAddress,
    amount: Amount
  ): Promise<EthereumTransactionDetails> {
    return {
      method: "withdraw(uint256,address)",
      args: [amount.toBase().toString(), recipient.toString()],
      transaction: {
        from: await this.config.signer.getAddress(),
      },
    };
  }
}
