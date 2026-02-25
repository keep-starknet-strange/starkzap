import type {
  Account,
  Call,
  EstimateFeeResponseOverhead,
  RpcProvider,
  TypedData,
  Signature,
} from "starknet";
import type { Tx } from "@/tx";
import type { TxBuilder } from "@/tx/builder";
import type { Erc20 } from "@/erc20";
import type { Staking } from "@/staking";
import type { SwapInput, SwapQuote, SwapProvider } from "@/swap";
import type {
  Address,
  Amount,
  ChainId,
  DeployOptions,
  EnsureReadyOptions,
  ExecuteOptions,
  FeeMode,
  PoolMember,
  PreflightOptions,
  PreflightResult,
  Token,
} from "@/types";

/**
 * Interface for a connected Starknet wallet.
 *
 * This interface defines the contract that all wallet implementations must follow,
 * allowing for different wallet providers (custom signers, Privy, etc.)
 * to be used interchangeably.
 *
 * @example
 * ```ts
 * // Using with custom signer
 * const wallet = await sdk.connectWallet({
 *   account: { signer: new StarkSigner(privateKey) }
 * });
 *
 * // All wallet implementations share WalletInterface
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
   *
   * @param options.feeMode - How to pay for deployment ("user_pays" or "sponsored")
   */
  deploy(options?: DeployOptions): Promise<Tx>;

  /**
   * Execute one or more contract calls.
   * Returns a Tx object to track the transaction.
   */
  execute(calls: Call[], options?: ExecuteOptions): Promise<Tx>;

  /**
   * Call a read-only contract entrypoint.
   *
   * This executes an RPC `call` without sending a transaction.
   * Use this for view methods that don't mutate state.
   */
  callContract(call: Call): ReturnType<RpcProvider["callContract"]>;

  /**
   * Create a transaction builder for batching multiple operations into a single transaction.
   *
   * Chain operations fluently and call `.send()` to execute them atomically.
   *
   * @example
   * ```ts
   * const tx = await wallet.tx()
   *   .transfer(USDC, { to: alice, amount: Amount.parse("50", USDC) })
   *   .enterPool(poolAddress, Amount.parse("100", STRK))
   *   .send();
   * ```
   */
  tx(): TxBuilder;

  /**
   * Fetch a quote.
   *
   * Set `request.provider` to a provider instance or provider id.
   * If omitted, uses the wallet default provider.
   */
  getQuote(request: SwapInput): Promise<SwapQuote>;

  /**
   * Backward-compatible alias for `getQuote`.
   */
  quoteSwap(request: SwapInput): Promise<SwapQuote>;

  /**
   * Execute a swap.
   *
   * Set `request.provider` to a provider instance or provider id.
   * If omitted, uses the wallet default provider.
   */
  swap(request: SwapInput, options?: ExecuteOptions): Promise<Tx>;

  /**
   * Register or replace a swap provider on this wallet.
   */
  registerSwapProvider(provider: SwapProvider, makeDefault?: boolean): void;

  /**
   * Set the default swap provider by id.
   */
  setDefaultSwapProvider(providerId: string): void;

  /**
   * Resolve a registered provider by id.
   */
  getSwapProvider(providerId: string): SwapProvider;

  /**
   * Resolve the wallet default swap provider.
   */
  getDefaultSwapProvider(): SwapProvider;

  /**
   * List registered swap provider ids.
   */
  listSwapProviders(): string[];

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
   * Get the chain ID this wallet is connected to.
   */
  getChainId(): ChainId;

  /**
   * Get the default fee mode for this wallet.
   */
  getFeeMode(): FeeMode;

  /**
   * Get the account class hash.
   */
  getClassHash(): string;

  /**
   * Estimate the fee for executing calls.
   */
  estimateFee(calls: Call[]): Promise<EstimateFeeResponseOverhead>;

  /**
   * Disconnect the wallet and clean up resources.
   */
  disconnect(): Promise<void>;

  // ============================================================
  // ERC20 methods
  // ============================================================

  /**
   * Gets or creates an Erc20 instance for the given token.
   */
  erc20(token: Token): Erc20;

  /**
   * Transfer ERC20 tokens to one or more recipients.
   */
  transfer(
    token: Token,
    transfers: { to: Address; amount: Amount }[],
    options?: ExecuteOptions
  ): Promise<Tx>;

  /**
   * Get the wallet's balance of an ERC20 token.
   */
  balanceOf(token: Token): Promise<Amount>;

  // ============================================================
  // Staking methods
  // ============================================================

  /**
   * Get or create a Staking instance for a specific pool.
   */
  staking(poolAddress: Address): Promise<Staking>;

  /**
   * Get or create a Staking instance for a validator's pool.
   */
  stakingInStaker(stakerAddress: Address, token: Token): Promise<Staking>;

  /**
   * Enter a delegation pool as a new member.
   */
  enterPool(
    poolAddress: Address,
    amount: Amount,
    options?: ExecuteOptions
  ): Promise<Tx>;

  /**
   * Add more tokens to an existing stake in a pool.
   */
  addToPool(
    poolAddress: Address,
    amount: Amount,
    options?: ExecuteOptions
  ): Promise<Tx>;

  /**
   * Stake in a pool, automatically entering or adding based on membership.
   */
  stake(
    poolAddress: Address,
    amount: Amount,
    options?: ExecuteOptions
  ): Promise<Tx>;

  /**
   * Claim accumulated staking rewards from a pool.
   */
  claimPoolRewards(poolAddress: Address, options?: ExecuteOptions): Promise<Tx>;

  /**
   * Initiate an exit from a delegation pool.
   */
  exitPoolIntent(
    poolAddress: Address,
    amount: Amount,
    options?: ExecuteOptions
  ): Promise<Tx>;

  /**
   * Complete the exit from a delegation pool.
   */
  exitPool(poolAddress: Address, options?: ExecuteOptions): Promise<Tx>;

  /**
   * Check if the wallet is a member of a delegation pool.
   */
  isPoolMember(poolAddress: Address): Promise<boolean>;

  /**
   * Get the wallet's staking position in a pool.
   */
  getPoolPosition(poolAddress: Address): Promise<PoolMember | null>;

  /**
   * Get the validator's commission rate for a pool.
   */
  getPoolCommission(poolAddress: Address): Promise<number>;
}
