import {
  type Call,
  Contract,
  type ProviderOrAccount,
  type RpcProvider,
  type TypedContractV2,
} from "starknet";
import { getTokensFromAddresses } from "@/erc20";
import {
  type Address,
  Amount,
  type ExecuteOptions,
  fromAddress,
  type StakingConfig,
  type Token,
} from "@/types";
import { ABI as POOL_ABI } from "@/abi/pool";
import { ABI as STAKING_ABI } from "@/abi/staking";
import { ABI as ERC20_ABI } from "@/abi/erc20";
import type { WalletInterface } from "@/wallet";
import type { Tx } from "@/tx";
import type { Pool, PoolMember } from "@/types/pool";
import { groupBy } from "@/utils";

/**
 * Represents a staking delegation pool and provides methods to interact with it.
 *
 * The Staking class allows delegators to:
 * - Enter and exit delegation pools
 * - Add to existing stakes
 * - Claim rewards
 * - Query pool information and APY
 *
 * @example
 * ```ts
 * // Get a staking instance for a specific validator
 * const staking = await Staking.fromStaker(validatorAddress, strkToken, provider, config);
 *
 * // Enter the pool
 * const tx = await staking.enter(wallet, Amount.parse(100, strkToken));
 * await tx.wait();
 *
 * // Check your position
 * const position = await staking.getPosition(wallet);
 * if (position) {
 *   console.log(`Staked: ${position.staked.toFormatted()}`);
 * }
 * ```
 */
export class Staking {
  private readonly pool: TypedContractV2<typeof POOL_ABI>;
  private readonly token: Token;
  private readonly provider: RpcProvider;

  private constructor(
    pool: TypedContractV2<typeof POOL_ABI>,
    token: Token,
    provider: RpcProvider
  ) {
    this.pool = pool;
    this.token = token;
    this.provider = provider;
  }

  /**
   * The pool contract address for this staking instance.
   *
   * @returns The Starknet address of the delegation pool contract
   */
  get poolAddress(): Address {
    return fromAddress(this.pool.address);
  }

  /**
   * Build approve + enter pool Calls without executing.
   *
   * @internal Used by {@link TxBuilder} — not part of the public API.
   */
  populateEnter(walletAddress: Address, amount: Amount): Call[] {
    const tokenContract = this.tokenContract(this.provider);
    const approveCall = tokenContract.populateTransaction.approve(
      this.pool.address,
      amount.toBase()
    );
    const enterPoolCall = this.pool.populateTransaction.enter_delegation_pool(
      walletAddress,
      amount.toBase()
    );
    return [approveCall, enterPoolCall];
  }

  /**
   * Enter the delegation pool as a new member.
   *
   * This will approve the token transfer and stake the specified amount in the pool.
   * The wallet must not already be a member of this pool.
   *
   * @param wallet - The wallet to stake from
   * @param amount - The amount of tokens to stake
   * @param options - Optional execution options (e.g., gas settings)
   * @returns A transaction object that can be awaited for confirmation
   * @throws Error if the wallet is already a member of the pool
   *
   * @example
   * ```ts
   * const tx = await staking.enter(wallet, Amount.parse(100, strkToken));
   * await tx.wait();
   * ```
   */
  async enter(
    wallet: WalletInterface,
    amount: Amount,
    options?: ExecuteOptions
  ): Promise<Tx> {
    if (await this.isMember(wallet)) {
      throw new Error(
        `Wallet ${wallet.address} is already a member in pool ${this.pool.address}`
      );
    }

    const calls = this.populateEnter(wallet.address, amount);
    return await wallet.execute(calls, options);
  }

  /**
   * Check if a wallet is a member of this delegation pool.
   *
   * @param wallet - The wallet to check
   * @returns True if the wallet is a pool member, false otherwise
   */
  async isMember(wallet: WalletInterface): Promise<boolean> {
    const member = await this.pool.get_pool_member_info_v1(wallet.address);
    return member.isSome();
  }

  /**
   * Get the current staking position for a wallet in this pool.
   *
   * Returns detailed information about the delegator's stake including:
   * - Staked amount
   * - Unclaimed rewards
   * - Exit/unpooling status
   * - Commission rate
   *
   * @param wallet - The wallet to query
   * @returns The pool member position, or null if not a member
   *
   * @example
   * ```ts
   * const position = await staking.getPosition(wallet);
   * if (position) {
   *   console.log(`Staked: ${position.staked.toFormatted()}`);
   *   console.log(`Rewards: ${position.rewards.toFormatted()}`);
   * }
   * ```
   */
  async getPosition(wallet: WalletInterface): Promise<PoolMember | null> {
    const memberInfo = await this.pool.get_pool_member_info_v1(wallet.address);

    if (memberInfo.isNone()) {
      return null;
    }

    // Type assertion is safe because we checked isNone() above
    const info = memberInfo.unwrap()!;
    const staked = Amount.fromRaw(info.amount, this.token);
    const rewards = Amount.fromRaw(info.unclaimed_rewards, this.token);
    const unpooling = Amount.fromRaw(info.unpool_amount, this.token);

    // Commission is 0-10000, convert to percentage
    const commissionPercent = Number(info.commission) / 100;

    // Parse unpool time if present
    let unpoolTime: Date | null = null;
    if (info.unpool_time.isSome()) {
      const timestamp = info.unpool_time.unwrap()!;
      unpoolTime = new Date(Number(timestamp.seconds) * 1000);
    }

    return {
      staked,
      rewards,
      total: staked.add(rewards),
      unpooling,
      unpoolTime,
      commissionPercent,
      rewardAddress: fromAddress(info.reward_address),
    };
  }

  /**
   * Get the validator's commission rate for this pool.
   *
   * The commission is the percentage of rewards that the validator takes
   * before distributing to delegators.
   *
   * @returns The commission as a percentage (e.g., 10 means 10%)
   *
   * @example
   * ```ts
   * const commission = await staking.getCommission();
   * console.log(`Validator commission: ${commission}%`);
   * ```
   */
  async getCommission(): Promise<number> {
    const params = await this.pool.contract_parameters_v1();
    return Number(params.commission) / 100;
  }

  /**
   * Build approve + add-to-pool Calls without executing.
   *
   * @internal Used by {@link TxBuilder} — not part of the public API.
   */
  populateAdd(walletAddress: Address, amount: Amount): Call[] {
    const tokenContract = this.tokenContract(this.provider);
    const approveCall = tokenContract.populateTransaction.approve(
      this.pool.address,
      amount.toBase()
    );
    const addPoolCall = this.pool.populateTransaction.add_to_delegation_pool(
      walletAddress,
      amount.toBase()
    );
    return [approveCall, addPoolCall];
  }

  /**
   * Add more tokens to an existing stake in the pool.
   *
   * The wallet must already be a member of the pool. Use `enter()` for first-time staking.
   *
   * @param wallet - The wallet to add stake from
   * @param amount - The amount of tokens to add
   * @param options - Optional execution options
   * @returns A transaction object that can be awaited for confirmation
   * @throws Error if the wallet is not a member of the pool
   *
   * @example
   * ```ts
   * const tx = await staking.add(wallet, Amount.parse(50, strkToken));
   * await tx.wait();
   * ```
   */
  async add(
    wallet: WalletInterface,
    amount: Amount,
    options?: ExecuteOptions
  ): Promise<Tx> {
    await this.assertIsMember(wallet);
    const calls = this.populateAdd(wallet.address, amount);
    return await wallet.execute(calls, options);
  }

  /**
   * Build a claim-rewards Call without executing.
   *
   * @internal Used by {@link TxBuilder} — not part of the public API.
   */
  populateClaimRewards(walletAddress: Address): Call {
    return this.pool.populateTransaction.claim_rewards(walletAddress);
  }

  /**
   * Claim accumulated staking rewards.
   *
   * Transfers all unclaimed rewards to the wallet's reward address.
   * The caller must be the reward address for this pool member.
   *
   * @param wallet - The wallet to claim rewards for
   * @param options - Optional execution options
   * @returns A transaction object that can be awaited for confirmation
   * @throws Error if the wallet is not a member of the pool
   * @throws Error if the caller is not the reward address for this member
   * @throws Error if there are no rewards to claim
   *
   * @example
   * ```ts
   * const position = await staking.getPosition(wallet);
   * if (position && !position.rewards.isZero()) {
   *   const tx = await staking.claimRewards(wallet);
   *   await tx.wait();
   * }
   * ```
   */
  async claimRewards(
    wallet: WalletInterface,
    options?: ExecuteOptions
  ): Promise<Tx> {
    const member = await this.assertIsMember(wallet);

    if (member.rewardAddress !== wallet.address) {
      throw new Error(`Cannot claim rewards from address ${wallet.address}`);
    }

    if (member.rewards.isZero()) {
      throw new Error(`No rewards to claim yet`);
    }

    const claimCall = this.populateClaimRewards(wallet.address);
    return await wallet.execute([claimCall], options);
  }

  /**
   * Build an exit-intent Call without executing.
   *
   * @internal Used by {@link TxBuilder} — not part of the public API.
   */
  populateExitIntent(amount: Amount): Call {
    return this.pool.populateTransaction.exit_delegation_pool_intent(
      amount.toBase()
    );
  }

  /**
   * Initiate an exit from the delegation pool.
   *
   * This starts the unstaking process by declaring intent to withdraw.
   * After calling this, you must wait for the exit window to pass before
   * calling `exit()` to complete the withdrawal.
   *
   * The specified amount will stop earning rewards immediately and will
   * be locked until the exit window completes.
   *
   * @param wallet - The wallet to exit from the pool
   * @param amount - The amount to unstake
   * @param options - Optional execution options
   * @returns A transaction object that can be awaited for confirmation
   * @throws Error if the wallet is not a member of the pool
   * @throws Error if the wallet already has a pending exit
   * @throws Error if the requested amount exceeds the staked balance
   *
   * @example
   * ```ts
   * // Step 1: Declare exit intent
   * const exitTx = await staking.exitIntent(wallet, Amount.parse(50, strkToken));
   * await exitTx.wait();
   *
   * // Step 2: Wait for exit window (check position.unpoolTime)
   * const position = await staking.getPosition(wallet);
   * console.log(`Can exit after: ${position?.unpoolTime}`);
   *
   * // Step 3: Complete exit after window passes
   * const completeTx = await staking.exit(wallet);
   * await completeTx.wait();
   * ```
   */
  async exitIntent(
    wallet: WalletInterface,
    amount: Amount,
    options?: ExecuteOptions
  ): Promise<Tx> {
    const member = await this.assertIsMember(wallet);

    if (!member.unpooling.isZero()) {
      throw new Error("Wallet is already in process to exit pool.");
    }

    if (member.staked.lt(amount)) {
      throw new Error(
        `Staked amount ${member.staked.toFormatted()} is lower than exiting intent amount.`
      );
    }

    const exitCall = this.populateExitIntent(amount);
    return await wallet.execute([exitCall], options);
  }

  /**
   * Build an exit-pool Call without executing.
   *
   * @internal Used by {@link TxBuilder} — not part of the public API.
   */
  populateExit(walletAddress: Address): Call {
    return this.pool.populateTransaction.exit_delegation_pool_action(
      walletAddress
    );
  }

  /**
   * Complete the exit from the delegation pool.
   *
   * This finalizes the unstaking process and transfers the tokens back to the wallet.
   * Can only be called after the exit window has passed following an `exitIntent()` call.
   *
   * @param wallet - The wallet completing the exit
   * @param options - Optional execution options
   * @returns A transaction object that can be awaited for confirmation
   * @throws Error if no exit intent exists or the exit window hasn't passed
   *
   * @example
   * ```ts
   * const position = await staking.getPosition(wallet);
   * if (position?.unpoolTime && new Date() >= position.unpoolTime) {
   *   const tx = await staking.exit(wallet);
   *   await tx.wait();
   * }
   * ```
   */
  async exit(wallet: WalletInterface, options?: ExecuteOptions): Promise<Tx> {
    const member = await this.assertIsMember(wallet);

    const unpoolTime = member.unpoolTime;
    if (!unpoolTime) {
      throw new Error("Wallet has not requested to unstake from this pool.");
    }

    const now = new Date();
    if (now < unpoolTime) {
      throw new Error("Wallet cannot unstake yet.");
    }

    const exitCall = this.populateExit(wallet.address);
    return await wallet.execute([exitCall], options);
  }

  /**
   * Creates a typed ERC20 contract instance for the staking token.
   *
   * @param providerOrAccount - The provider or account to use for contract calls
   * @returns A typed ERC20 contract instance
   */
  private tokenContract(
    providerOrAccount: ProviderOrAccount
  ): TypedContractV2<typeof ERC20_ABI> {
    return new Contract({
      abi: ERC20_ABI,
      address: this.token.address,
      providerOrAccount: providerOrAccount,
    }).typedv2(ERC20_ABI);
  }

  /**
   * Asserts that a wallet is a member of this pool and returns its position.
   *
   * @param wallet - The wallet to check
   * @returns The pool member position
   * @throws Error if the wallet is not a member of the pool
   */
  private async assertIsMember(wallet: WalletInterface): Promise<PoolMember> {
    const maybeMember = await this.getPosition(wallet);
    if (!maybeMember) {
      throw new Error(
        `Wallet ${wallet.address} is not a member in pool ${this.pool.address}`
      );
    }

    return maybeMember;
  }

  /**
   * Create a Staking instance from a known pool contract address.
   *
   * Use this when you know the specific pool contract address you want to interact with.
   *
   * @param poolAddress - The pool contract address
   * @param provider - The RPC provider
   * @param config - The staking configuration
   * @returns A Staking instance for the specified pool
   * @throws Error if the pool doesn't exist or token cannot be resolved
   *
   * @example
   * ```ts
   * const staking = await Staking.fromPool(
   *   poolAddress,
   *   provider,
   *   config.staking
   * );
   * ```
   */
  static async fromPool(
    poolAddress: Address,
    provider: RpcProvider,
    config: StakingConfig
  ): Promise<Staking> {
    const poolContract = new Contract({
      abi: POOL_ABI,
      address: poolAddress,
      providerOrAccount: provider,
    }).typedv2(POOL_ABI);
    const poolParameters = await poolContract.contract_parameters_v1();

    const stakerAddress = fromAddress(poolParameters.staker_address);
    const stakingContractAddressFromPool = fromAddress(
      poolParameters.staking_contract
    );

    if (stakingContractAddressFromPool !== config.contract) {
      throw new Error("Staking contract address is wrong in the config.");
    }

    const stakingContract = new Contract({
      abi: STAKING_ABI,
      address: stakingContractAddressFromPool,
      providerOrAccount: provider,
    }).typedv2(STAKING_ABI);

    const staker = await stakingContract.staker_pool_info(stakerAddress);
    const pool = staker.pools.find((pool) => {
      return fromAddress(pool.pool_contract) === poolAddress;
    });

    if (!pool) {
      throw new Error(`Could not verify pool address ${poolAddress}`);
    }

    const token = await getTokensFromAddresses(
      [fromAddress(pool.token_address)],
      provider
    ).then((tokens) => {
      return tokens[0];
    });

    if (!token) {
      throw new Error(
        `Could not resolve token ${pool.token_address} in Pool ${poolAddress}`
      );
    }

    return new Staking(poolContract, token, provider);
  }

  /**
   * Create a Staking instance from a validator's (staker's) address.
   *
   * This is the most common way to get a Staking instance when you want to
   * delegate to a specific validator. The method finds the pool for the
   * specified token managed by this validator.
   *
   * @param stakerAddress - The validator's staker address
   * @param token - The token to stake (e.g., STRK)
   * @param provider - The RPC provider
   * @param config - The staking configuration
   * @returns A Staking instance for the validator's pool
   * @throws Error if the validator doesn't have a pool for the specified token
   *
   * @example
   * ```ts
   * const staking = await Staking.fromStaker(
   *   validatorAddress,
   *   strkToken,
   *   provider,
   *   config.staking
   * );
   * ```
   */
  static async fromStaker(
    stakerAddress: Address,
    token: Token,
    provider: RpcProvider,
    config: StakingConfig
  ): Promise<Staking> {
    const stakingContract = new Contract({
      abi: STAKING_ABI,
      address: config.contract,
      providerOrAccount: provider,
    }).typedv2(STAKING_ABI);

    const info = await stakingContract.staker_pool_info(stakerAddress);
    const pool = info.pools.find((pool) => {
      return fromAddress(pool.token_address) === token.address;
    });

    if (!pool) {
      throw new Error(
        `No pool exists by staker ${stakerAddress} for ${token.symbol}`
      );
    }

    const poolContract = new Contract({
      abi: POOL_ABI,
      address: fromAddress(pool.pool_contract),
      providerOrAccount: provider,
    }).typedv2(POOL_ABI);

    return new Staking(poolContract, token, provider);
  }

  /**
   * Get all tokens that are currently enabled for staking.
   *
   * Returns the list of tokens that can be staked in the protocol.
   * Typically, includes STRK and may include other tokens like wrapped BTC.
   *
   * @param provider - The RPC provider
   * @param config - The staking configuration
   * @returns Array of tokens that can be staked
   *
   * @example
   * ```ts
   * const tokens = await Staking.activeTokens(provider, config.staking);
   * console.log(`Stakeable tokens: ${tokens.map(t => t.symbol).join(', ')}`);
   * ```
   */
  static async activeTokens(
    provider: RpcProvider,
    config: StakingConfig
  ): Promise<Token[]> {
    const stakingContract = new Contract({
      abi: STAKING_ABI,
      address: config.contract,
      providerOrAccount: provider,
    }).typedv2(STAKING_ABI);

    const tokenAddresses = await stakingContract
      .get_active_tokens()
      .then((addresses) => {
        return addresses.map((address) => {
          return fromAddress(address);
        });
      });

    return await getTokensFromAddresses(tokenAddresses, provider);
  }

  /**
   * Get all delegation pools managed by a specific validator.
   *
   * Validators can have multiple pools, one for each supported token.
   * This method returns information about each pool including the
   * pool contract address, token, and total delegated amount.
   *
   * @param provider - The RPC provider
   * @param stakerAddress - The validator's staker address
   * @param config - The staking configuration
   * @returns Array of pools managed by the validator
   *
   * @example
   * ```ts
   * const pools = await Staking.getStakerPools(provider, validatorAddress, config.staking);
   * for (const pool of pools) {
   *   console.log(`${pool.token.symbol} pool: ${pool.amount.toFormatted()} delegated`);
   * }
   * ```
   */
  static async getStakerPools(
    provider: RpcProvider,
    stakerAddress: Address,
    config: StakingConfig
  ): Promise<Pool[]> {
    const stakingContract = new Contract({
      abi: STAKING_ABI,
      address: config.contract,
      providerOrAccount: provider,
    }).typedv2(STAKING_ABI);

    const { pools } = await stakingContract.staker_pool_info(stakerAddress);

    const tokenAddresses = pools.map((pool) => {
      return fromAddress(pool.token_address);
    });

    const tokens = await getTokensFromAddresses(tokenAddresses, provider);
    const tokensMap = groupBy(tokens, (token) => token.address);
    return pools.flatMap((pool) => {
      const poolAddress = fromAddress(pool.pool_contract);
      const tokens = tokensMap.get(fromAddress(pool.token_address));
      const token = tokens?.[0];
      if (!token) {
        return [];
      }

      return [
        {
          poolContract: poolAddress,
          token: token,
          amount: Amount.fromRaw(pool.amount, token),
        },
      ];
    });
  }
}
