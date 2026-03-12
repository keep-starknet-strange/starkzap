import { CanonicalEthereumBridge } from "@/bridge/ethereum/canonical/CanonicalEthereumBridge";
import { ethereumAddress } from "@/bridge/ethereum/EtherToken";
import type { EthereumTransactionDetails } from "@/bridge/ethereum/types";
import type { Address } from "@/types";
import { Amount, EthereumBridgeToken } from "@/types";
import type { EthereumWalletConfig } from "@/bridge/ethereum/types";
import type { WalletInterface } from "@/wallet";
import { RPC, uint256 } from "starknet";
import { FeeErrorCause } from "@/types/errors";
import LORDS_BRIDGE_ABI from "@/abi/ethereum/lordsBridge.json";

export class LordsBridge extends CanonicalEthereumBridge {
  constructor(
    bridgeToken: EthereumBridgeToken,
    config: EthereumWalletConfig,
    starknetWallet: WalletInterface
  ) {
    super(bridgeToken, config, starknetWallet, LORDS_BRIDGE_ABI);
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
}
