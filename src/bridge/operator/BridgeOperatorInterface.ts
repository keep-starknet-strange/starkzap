import { BridgeToken } from "@/types/bridge/bridge-token";
import { type ConnectedExternalWallet } from "@/connect";
import type {
  Address,
  Amount,
  BridgeDepositFeeEstimation,
  ExternalTransactionResponse,
} from "@/types";
import type { BridgeDepositOptions } from "@/bridge/types/BridgeInterface";

export interface BridgeOperatorInterface {
  /**
   * Bridge tokens from an external chain into Starknet.
   *
   * @param recipient - Starknet address to receive bridged funds
   * @param amount - Amount to bridge
   * @param token - Bridge token descriptor (chain, protocol, bridge contracts)
   * @param externalWallet - Connected external wallet on the token source chain
   * @param options - Optional bridge/protocol-specific deposit options
   * @returns External transaction response containing the source-chain tx hash
   */
  deposit(
    recipient: Address,
    amount: Amount,
    token: BridgeToken,
    externalWallet: ConnectedExternalWallet,
    options?: BridgeDepositOptions
  ): Promise<ExternalTransactionResponse>;

  /**
   * Get the currently available external balance that can be deposited.
   *
   * @param token - Bridge token descriptor to query
   * @param externalWallet - Connected external wallet on the token source chain
   * @returns Available deposit balance on the external chain
   */
  getDepositBalance(
    token: BridgeToken,
    externalWallet: ConnectedExternalWallet
  ): Promise<Amount>;

  /**
   * Estimate bridging fees on the source chain and destination messaging layer.
   *
   * @param token - Bridge token descriptor to estimate for
   * @param externalWallet - Connected external wallet on the token source chain
   * @param options - Optional bridge/protocol-specific estimation options
   * @returns Detailed bridge fee estimation for the current route
   */
  getDepositFeeEstimate(
    token: BridgeToken,
    externalWallet: ConnectedExternalWallet,
    options?: BridgeDepositOptions
  ): Promise<BridgeDepositFeeEstimation>;

  /**
   * Get the ERC20 allowance granted to the bridge spender on the external chain.
   *
   * Returns `null` when allowance is not applicable.
   *
   * @param token - Bridge token descriptor to query
   * @param externalWallet - Connected external wallet on the token source chain
   * @returns Current allowance, or `null` if allowance is not applicable
   */
  getAllowance(
    token: BridgeToken,
    externalWallet: ConnectedExternalWallet
  ): Promise<Amount | null>;
}
