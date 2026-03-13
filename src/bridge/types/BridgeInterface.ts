import {
  type Address,
  Amount,
  type BridgeDepositFeeEstimation,
  type ExternalAddress,
  type ExternalTransactionResponse,
} from "@/types";
import type { WalletInterface } from "@/wallet";

/**
 * Protocol-specific options for bridge deposit operations.
 *
 * These options are passed through the generic bridge interface and operator.
 * Each bridge implementation reads only the fields relevant to its protocol
 * and ignores the rest.
 */
export interface BridgeDepositOptions {
  /**
   * Enable fast transfer mode for CCTP (native USDC) deposits.
   *
   * When `true`, the deposit uses a lower finality threshold and pays
   * a small basis-point fee (deducted from the transferred USDC amount)
   * in exchange for faster cross-chain settlement.
   *
   * Ignored by non-CCTP bridge implementations.
   */
  fastTransfer?: boolean;
}

export interface BridgeInterface<A extends ExternalAddress = ExternalAddress> {
  readonly starknetWallet: WalletInterface;

  deposit(
    recipient: Address,
    amount: Amount,
    options?: BridgeDepositOptions
  ): Promise<ExternalTransactionResponse>;

  getDepositFeeEstimate(
    options?: BridgeDepositOptions
  ): Promise<BridgeDepositFeeEstimation>;

  getAvailableDepositBalance(account: A): Promise<Amount>;

  getAllowance(): Promise<Amount | null>;
}
