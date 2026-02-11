import type { WalletInterface } from "@/wallet/interface";
import {
  type Address,
  Amount,
  type ChainId,
  type DeployOptions,
  type EnsureReadyOptions,
  type ExecuteOptions,
  type FeeMode,
  type PoolMember,
  type PreflightOptions,
  type PreflightResult,
  type StakingConfig,
  type Token,
} from "@/types";
import type { Tx } from "@/tx";
import { TxBuilder } from "@/tx/builder";
import type {
  Account,
  Call,
  EstimateFeeResponseOverhead,
  RpcProvider,
  Signature,
  TypedData,
} from "starknet";
import { Erc20 } from "@/erc20";
import { Staking } from "@/staking";

/**
 * Abstract base class for wallet implementations.
 *
 * Provides shared functionality, ERC20 token operations, and staking operations
 * for all wallet types. Child classes (e.g., `Wallet`, `CartridgeWallet`) must
 * implement the abstract methods to provide wallet-specific behavior.
 *
 * @remarks
 * This class implements the delegation pattern for ERC20 and Staking operations,
 * caching instances per token/pool address for efficient reuse.
 *
 * @example
 * ```ts
 * class CustomWallet extends BaseWallet {
 *   constructor(address: Address, private account: Account) {
 *     super(address, undefined);
 *   }
 *
 *   async isDeployed(): Promise<boolean> {
 *     // Custom implementation
 *   }
 *   // ... implement other abstract methods
 * }
 * ```
 */
export abstract class BaseWallet implements WalletInterface {
  /** The wallet's Starknet address */
  readonly address: Address;

  /** Staking configuration, required for staking operations */
  private readonly stakingConfig: StakingConfig | undefined;

  /**
   * Cache of Erc20 instances keyed by token address.
   * Prevents creating multiple instances for the same token.
   */
  private erc20s: Map<Address, Erc20> = new Map();

  /**
   * Cache of Staking instances keyed by pool address.
   * Prevents creating multiple instances for the same pool.
   */
  private stakingMap: Map<Address, Staking> = new Map();

  /**
   * Creates a new BaseWallet instance.
   * @param address - The Starknet address of this wallet
   * @param stakingConfig - Optional staking configuration for staking operations
   */
  protected constructor(
    address: Address,
    stakingConfig: StakingConfig | undefined
  ) {
    this.address = address;
    this.stakingConfig = stakingConfig;
  }

  /**
   * Get all ERC20 instances that have been accessed by this wallet.
   *
   * Returns cached Erc20 instances for tokens that have been interacted with
   * via `erc20()`, `transfer()`, or `balanceOf()` methods.
   *
   * @returns Array of active Erc20 instances
   */
  get activeErc20(): Erc20[] {
    return Array.from(this.erc20s.values());
  }

  /**
   * Get all Staking instances that have been accessed by this wallet.
   *
   * Returns cached Staking instances for pools that have been interacted with
   * via `staking()`, `stakingInStaker()`, or any pool operation methods.
   *
   * @returns Array of active Staking instances
   */
  get activeStaking(): Staking[] {
    return Array.from(this.stakingMap.values());
  }

  // ============================================================
  // Abstract methods - children MUST implement
  // ============================================================

  /** @inheritdoc */
  abstract isDeployed(): Promise<boolean>;

  /** @inheritdoc */
  abstract ensureReady(options?: EnsureReadyOptions): Promise<void>;

  /** @inheritdoc */
  abstract deploy(options?: DeployOptions): Promise<Tx>;

  /** @inheritdoc */
  abstract execute(calls: Call[], options?: ExecuteOptions): Promise<Tx>;

  /** @inheritdoc */
  abstract signMessage(typedData: TypedData): Promise<Signature>;

  /** @inheritdoc */
  abstract preflight(options: PreflightOptions): Promise<PreflightResult>;

  /** @inheritdoc */
  abstract getAccount(): Account;

  /** @inheritdoc */
  abstract getProvider(): RpcProvider;

  /** @inheritdoc */
  abstract getChainId(): ChainId;

  /** @inheritdoc */
  abstract getFeeMode(): FeeMode;

  /** @inheritdoc */
  abstract getClassHash(): string;

  /** @inheritdoc */
  abstract estimateFee(calls: Call[]): Promise<EstimateFeeResponseOverhead>;

  /** @inheritdoc */
  abstract disconnect(): Promise<void>;

  // ============================================================
  // Transaction builder
  // ============================================================

  /**
   * Create a transaction builder for batching multiple operations into a single transaction.
   *
   * @returns A new TxBuilder instance bound to this wallet
   *
   * @example
   * ```ts
   * const tx = await wallet.tx()
   *   .transfer(USDC, { to: alice, amount: Amount.parse("50", USDC) })
   *   .enterPool(poolAddress, Amount.parse("100", STRK))
   *   .send();
   * await tx.wait();
   * ```
   */
  tx(): TxBuilder {
    return new TxBuilder(this);
  }

  // ============================================================
  // ERC20 delegated methods
  // ============================================================

  /**
   * Gets or creates an Erc20 instance for the given token.
   *
   * Uses a cache to avoid creating multiple instances for the same token,
   * improving performance when performing multiple operations on the same token.
   *
   * @param token - The token to get an Erc20 instance for
   * @returns The cached or newly created Erc20 instance
   */
  erc20(token: Token): Erc20 {
    let erc20 = this.erc20s.get(token.address);
    if (!erc20) {
      erc20 = new Erc20(token, this.getProvider());
      this.erc20s.set(token.address, erc20);
    }

    return erc20;
  }

  /**
   * Transfer ERC20 tokens to one or more recipients.
   *
   * Multiple transfers can be batched into a single transaction for gas efficiency.
   * The Amount for each transfer must match the token's decimals and symbol.
   *
   * @param token - The ERC20 token to transfer
   * @param transfers - Array of transfer objects containing:
   *   - `to`: The recipient's Starknet address
   *   - `amount`: The Amount to transfer
   * @param options - Optional execution options (e.g., gas settings)
   * @returns A Tx object to track the transaction
   *
   * @throws Error if any amount's decimals or symbol don't match the token
   *
   * @example
   * ```ts
   * const tx = await wallet.transfer(USDC, [
   *   { to: alice, amount: Amount.parse("50", USDC) },
   *   { to: bob, amount: Amount.parse("25", USDC) },
   * ]);
   * await tx.wait();
   * ```
   *
   * @see {@link Erc20#transfer}
   */
  async transfer(
    token: Token,
    transfers: { to: Address; amount: Amount }[],
    options?: ExecuteOptions
  ): Promise<Tx> {
    const erc20 = this.erc20(token);
    return await erc20.transfer(this, transfers, options);
  }

  /**
   * Get the wallet's balance of an ERC20 token.
   *
   * The returned Amount includes the token's decimals and symbol,
   * allowing for easy formatting and display.
   *
   * @param token - The ERC20 token to check the balance of
   * @returns An Amount representing the token balance
   *
   * @example
   * ```ts
   * const balance = await wallet.balanceOf(USDC);
   * console.log(balance.toFormatted()); // "150.5 USDC"
   * ```
   *
   * @see {@link Erc20#balanceOf}
   */
  async balanceOf(token: Token): Promise<Amount> {
    const erc20 = this.erc20(token);
    return await erc20.balanceOf(this);
  }

  // ============================================================
  // Staking delegated methods
  // ============================================================

  /**
   * Enter a delegation pool as a new member.
   *
   * Approves the token transfer and stakes the specified amount in the pool.
   * The wallet must not already be a member of this pool.
   *
   * @param poolAddress - The pool contract address to enter
   * @param amount - The amount of tokens to stake
   * @param options - Optional execution options
   * @returns A Tx object to track the transaction
   *
   * @throws Error if the wallet is already a member of the pool
   *
   * @example
   * ```ts
   * const tx = await wallet.enterPool(poolAddress, Amount.parse("100", STRK));
   * await tx.wait();
   * ```
   *
   * @see {@link Staking#enter}
   */
  async enterPool(
    poolAddress: Address,
    amount: Amount,
    options?: ExecuteOptions
  ): Promise<Tx> {
    const staking = await this.staking(poolAddress);
    return await staking.enter(this, amount, options);
  }

  /**
   * Add more tokens to an existing stake in a pool.
   *
   * The wallet must already be a member of the pool.
   * Use `enterPool()` for first-time staking.
   *
   * @param poolAddress - The pool contract address
   * @param amount - The amount of tokens to add
   * @param options - Optional execution options
   * @returns A Tx object to track the transaction
   *
   * @throws Error if the wallet is not a member of the pool
   *
   * @example
   * ```ts
   * const tx = await wallet.addToPool(poolAddress, Amount.parse("50", STRK));
   * await tx.wait();
   * ```
   *
   * @see {@link Staking#add}
   */
  async addToPool(
    poolAddress: Address,
    amount: Amount,
    options?: ExecuteOptions
  ): Promise<Tx> {
    const staking = await this.staking(poolAddress);
    return await staking.add(this, amount, options);
  }

  /**
   * Claim accumulated staking rewards from a pool.
   *
   * Transfers all unclaimed rewards to the wallet's reward address.
   * The wallet must be the reward address for the pool membership.
   *
   * @param poolAddress - The pool contract address
   * @param options - Optional execution options
   * @returns A Tx object to track the transaction
   *
   * @throws Error if the wallet is not a member or has no rewards
   *
   * @example
   * ```ts
   * const position = await wallet.getPoolPosition(poolAddress);
   * if (!position?.rewards.isZero()) {
   *   const tx = await wallet.claimPoolRewards(poolAddress);
   *   await tx.wait();
   * }
   * ```
   *
   * @see {@link Staking#claimRewards}
   */
  async claimPoolRewards(
    poolAddress: Address,
    options?: ExecuteOptions
  ): Promise<Tx> {
    const staking = await this.staking(poolAddress);
    return await staking.claimRewards(this, options);
  }

  /**
   * Initiate an exit from a delegation pool.
   *
   * Starts the unstaking process by declaring intent to withdraw.
   * After calling this, wait for the exit window to pass, then call
   * `exitPool()` to complete the withdrawal.
   *
   * The specified amount stops earning rewards immediately and is
   * locked until the exit window completes.
   *
   * @param poolAddress - The pool contract address
   * @param amount - The amount to unstake
   * @param options - Optional execution options
   * @returns A Tx object to track the transaction
   *
   * @throws Error if the wallet is not a member or has a pending exit
   *
   * @example
   * ```ts
   * // Step 1: Declare exit intent
   * const tx = await wallet.exitPoolIntent(poolAddress, Amount.parse("50", STRK));
   * await tx.wait();
   *
   * // Step 2: Wait for exit window, then complete
   * const position = await wallet.getPoolPosition(poolAddress);
   * if (position?.unpoolTime && new Date() >= position.unpoolTime) {
   *   await wallet.exitPool(poolAddress);
   * }
   * ```
   *
   * @see {@link Staking#exitIntent}
   */
  async exitPoolIntent(
    poolAddress: Address,
    amount: Amount,
    options?: ExecuteOptions
  ): Promise<Tx> {
    const staking = await this.staking(poolAddress);
    return await staking.exitIntent(this, amount, options);
  }

  /**
   * Complete the exit from a delegation pool.
   *
   * Finalizes the unstaking process and transfers tokens back to the wallet.
   * Can only be called after the exit window has passed following `exitPoolIntent()`.
   *
   * @param poolAddress - The pool contract address
   * @param options - Optional execution options
   * @returns A Tx object to track the transaction
   *
   * @throws Error if no exit intent exists or exit window hasn't passed
   *
   * @example
   * ```ts
   * const position = await wallet.getPoolPosition(poolAddress);
   * if (position?.unpoolTime && new Date() >= position.unpoolTime) {
   *   const tx = await wallet.exitPool(poolAddress);
   *   await tx.wait();
   * }
   * ```
   *
   * @see {@link Staking#exit}
   */
  async exitPool(poolAddress: Address, options?: ExecuteOptions): Promise<Tx> {
    const staking = await this.staking(poolAddress);
    return await staking.exit(this, options);
  }

  /**
   * Check if the wallet is a member of a delegation pool.
   *
   * @param poolAddress - The pool contract address
   * @returns True if the wallet is a pool member, false otherwise
   *
   * @example
   * ```ts
   * if (await wallet.isPoolMember(poolAddress)) {
   *   console.log("Already staking in this pool");
   * }
   * ```
   *
   * @see {@link Staking#isMember}
   */
  async isPoolMember(poolAddress: Address): Promise<boolean> {
    const staking = await this.staking(poolAddress);
    return await staking.isMember(this);
  }

  /**
   * Get the wallet's staking position in a pool.
   *
   * Returns detailed information including staked amount, unclaimed rewards,
   * exit/unpooling status, and commission rate.
   *
   * @param poolAddress - The pool contract address
   * @returns The pool member position, or null if not a member
   *
   * @example
   * ```ts
   * const position = await wallet.getPoolPosition(poolAddress);
   * if (position) {
   *   console.log(`Staked: ${position.staked.toFormatted()}`);
   *   console.log(`Rewards: ${position.rewards.toFormatted()}`);
   * }
   * ```
   *
   * @see {@link Staking#getPosition}
   */
  async getPoolPosition(poolAddress: Address): Promise<PoolMember | null> {
    const staking = await this.staking(poolAddress);
    return await staking.getPosition(this);
  }

  /**
   * Get the validator's commission rate for a pool.
   *
   * The commission is the percentage of rewards the validator takes
   * before distributing to delegators.
   *
   * @param poolAddress - The pool contract address
   * @returns The commission as a percentage (e.g., 10 means 10%)
   *
   * @example
   * ```ts
   * const commission = await wallet.getPoolCommission(poolAddress);
   * console.log(`Validator commission: ${commission}%`);
   * ```
   *
   * @see {@link Staking#getCommission}
   */
  async getPoolCommission(poolAddress: Address): Promise<number> {
    const staking = await this.staking(poolAddress);
    return await staking.getCommission();
  }

  /**
   * Asserts that staking configuration is available.
   *
   * @returns The staking configuration
   * @throws Error if staking configuration was not provided to the SDK
   */
  private assertStakingConfig(): StakingConfig {
    if (!this.stakingConfig) {
      throw new Error("`stakingConfig` is not defined in the sdk config.");
    }

    return this.stakingConfig;
  }

  /**
   * Get or create a Staking instance for a specific pool.
   *
   * Uses a cache to avoid creating multiple instances for the same pool.
   * Use this when you know the pool contract address directly.
   *
   * @param poolAddress - The pool contract address
   * @returns A Staking instance for the specified pool
   *
   * @throws Error if staking is not configured
   * @throws Error if the pool doesn't exist
   *
   * @example
   * ```ts
   * const staking = await wallet.staking(poolAddress);
   * const position = await staking.getPosition(wallet);
   * ```
   *
   * @see {@link Staking.fromPool}
   */
  async staking(poolAddress: Address): Promise<Staking> {
    const config = this.assertStakingConfig();

    let staking = this.stakingMap.get(poolAddress);

    if (!staking) {
      staking = await Staking.fromPool(poolAddress, this.getProvider(), config);
      this.stakingMap.set(poolAddress, staking);
    }

    return staking;
  }

  /**
   * Get or create a Staking instance for a validator's pool.
   *
   * This is the most common way to access staking when you want to
   * delegate to a specific validator. Finds the pool for the specified
   * token managed by the validator.
   *
   * @param stakerAddress - The validator's staker address
   * @param token - The token to stake (e.g., STRK)
   * @returns A Staking instance for the validator's pool
   *
   * @throws Error if staking is not configured
   * @throws Error if the validator doesn't have a pool for the specified token
   *
   * @example
   * ```ts
   * const staking = await wallet.stakingInStaker(validatorAddress, STRK);
   * await staking.enter(wallet, Amount.parse("100", STRK));
   * ```
   *
   * @see {@link Staking.fromStaker}
   */
  async stakingInStaker(
    stakerAddress: Address,
    token: Token
  ): Promise<Staking> {
    const config = this.assertStakingConfig();

    const staking = await Staking.fromStaker(
      stakerAddress,
      token,
      this.getProvider(),
      config
    );

    const poolAddress = staking.poolAddress;
    this.stakingMap.set(poolAddress, staking);

    return staking;
  }
}
