import type {
  Account,
  Call,
  RpcProvider,
  TypedData,
  Signature,
} from "starknet";
import type { Tx } from "@/tx";
import type {
  Address,
  EnsureReadyOptions,
  ExecuteOptions,
  PreflightOptions,
  PreflightResult,
} from "@/types";

/**
 * Interface for a connected Starknet wallet.
 *
 * This interface defines the contract that all wallet implementations must follow,
 * allowing for different wallet providers (custom signers, Cartridge, etc.)
 * to be used interchangeably.
 *
 * @example
 * ```ts
 * // Using with custom signer
 * const wallet = await sdk.connectWallet({
 *   account: { signer: new StarkSigner(privateKey) }
 * });
 *
 * // Using with Cartridge
 * const wallet = await sdk.connectCartridge({
 *   policies: [{ target: "0x...", method: "transfer" }]
 * });
 *
 * // Both implement WalletInterface
 * await wallet.execute([...]);
 * ```
 */
export interface WalletInterface {
  /** The wallet's Starknet address */
  readonly address: Address;

  /**
   * Check if the account contract is deployed on-chain.
   */
  isDeployed(): Promise<boolean>;

  /**
   * Ensure the wallet is ready for transactions.
   * Optionally deploys the account if needed.
   */
  ensureReady(options?: EnsureReadyOptions): Promise<void>;

  /**
   * Deploy the account contract.
   * Returns a Tx object to track the deployment.
   */
  deploy(): Promise<Tx>;

  /**
   * Execute one or more contract calls.
   * Returns a Tx object to track the transaction.
   */
  execute(calls: Call[], options?: ExecuteOptions): Promise<Tx>;

  /**
   * Sign a typed data message (EIP-712 style).
   * Returns the signature.
   */
  signMessage(typedData: TypedData): Promise<Signature>;

  /**
   * Simulate a transaction to check if it would succeed.
   */
  preflight(options: PreflightOptions): Promise<PreflightResult>;

  /**
   * Get the underlying starknet.js Account instance.
   * Use this for advanced operations not covered by the SDK.
   */
  getAccount(): Account;

  /**
   * Get the RPC provider instance.
   * Use this for read-only operations like balance queries.
   */
  getProvider(): RpcProvider;

  /**
   * Disconnect the wallet and clean up resources.
   */
  disconnect(): Promise<void>;
}
