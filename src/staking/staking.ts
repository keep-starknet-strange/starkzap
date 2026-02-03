import {
  Contract,
  type ProviderOrAccount,
  type RpcProvider,
  type TypedContractV2,
} from "starknet";
import { getTokensFromAddresses } from "@/erc20";
import {
  type Address,
  Amount,
  type ChainId,
  type ExecuteOptions,
  fromAddress,
  type Token,
} from "@/types";
import { ABI as POOL_ABI } from "@resources/abi/pool";
import { ABI as STAKING_ABI } from "@resources/abi/staking";
import { ABI as ERC20_ABI } from "@resources/abi/erc20";
import type { Wallet } from "@/wallet";
import type { Tx } from "@/tx";
import type { PoolMember } from "@/types/pool";

export class Staking {
  private readonly pool: TypedContractV2<typeof POOL_ABI>;
  private readonly staking: TypedContractV2<typeof STAKING_ABI>;
  private readonly token: Token;
  private readonly provider: RpcProvider;

  private constructor(
    pool: TypedContractV2<typeof POOL_ABI>,
    staking: TypedContractV2<typeof STAKING_ABI>,
    token: Token,
    provider: RpcProvider
  ) {
    this.pool = pool;
    this.staking = staking;
    this.token = token;
    this.provider = provider;
  }

  async enter(
    wallet: Wallet,
    amount: Amount,
    options?: ExecuteOptions
  ): Promise<Tx> {
    if (await this.isMember(wallet)) {
      throw new Error(
        `Wallet ${wallet.address} is already a member in pool ${this.pool.address}`
      );
    }

    const tokenContract = this.tokenContract(wallet.getAccount());
    const approveCall = tokenContract.populateTransaction.approve(
      this.pool.address,
      amount.toBase()
    );

    const enterPoolCall = this.pool.populateTransaction.enter_delegation_pool(
      wallet.address,
      amount.toBase()
    );

    return await wallet.execute([approveCall, enterPoolCall], options);
  }

  async isMember(wallet: Wallet): Promise<boolean> {
    const member = await this.pool.get_pool_member_info_v1(wallet.address);
    return member.isSome();
  }

  async getPosition(wallet: Wallet): Promise<PoolMember | null> {
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

  async getCommission(): Promise<number> {
    const params = await this.pool.contract_parameters_v1();
    return Number(params.commission) / 100;
  }

  async add(
    wallet: Wallet,
    amount: Amount,
    options?: ExecuteOptions
  ): Promise<Tx> {
    await this.assertIsMember(wallet);

    const tokenContract = this.tokenContract(wallet.getAccount());
    const approveCall = tokenContract.populateTransaction.approve(
      this.pool.address,
      amount.toBase()
    );

    const addPoolCall = this.pool.populateTransaction.add_to_delegation_pool(
      wallet.address,
      amount.toBase()
    );

    return await wallet.execute([approveCall, addPoolCall], options);
  }

  async claimRewards(wallet: Wallet, options?: ExecuteOptions): Promise<Tx> {
    const member = await this.assertIsMember(wallet);

    if (member.rewardAddress !== wallet.address) {
      throw new Error(`Cannot claim rewards from address ${wallet.address}`);
    }

    if (member.rewards.isZero()) {
      throw new Error(`No rewards to claim yet`);
    }

    const claimCall = this.pool.populateTransaction.claim_rewards(
      wallet.address
    );
    return await wallet.execute([claimCall], options);
  }

  async exitIntent(
    wallet: Wallet,
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

    const exitCall = this.pool.populateTransaction.exit_delegation_pool_intent(
      amount.toBase()
    );

    return await wallet.execute([exitCall], options);
  }

  async exit(wallet: Wallet, options?: ExecuteOptions): Promise<Tx> {
    const member = await this.assertIsMember(wallet);

    const unpoolTime = member.unpoolTime;
    if (!unpoolTime) {
      throw new Error("Wallet has not requested to unstake from this pool.");
    }

    const now = new Date();
    if (now < unpoolTime) {
      throw new Error("Wallet cannot unstake yet.");
    }

    const exitCall = this.pool.populateTransaction.exit_delegation_pool_action(
      wallet.address
    );

    return await wallet.execute([exitCall], options);
  }

  private tokenContract(
    providerOrAccount: ProviderOrAccount
  ): TypedContractV2<typeof ERC20_ABI> {
    return new Contract({
      abi: ERC20_ABI,
      address: this.token.address,
      providerOrAccount: providerOrAccount,
    }).typedv2(ERC20_ABI);
  }

  private async assertIsMember(wallet: Wallet): Promise<PoolMember> {
    const maybeMember = await this.getPosition(wallet);
    if (!maybeMember) {
      throw new Error(
        `Wallet ${wallet.address} is not a member in pool ${this.pool.address}`
      );
    }

    return maybeMember;
  }

  static async fromPool(
    poolAddress: Address,
    token: Token,
    provider: RpcProvider,
    stakingContractAddress: Address
  ): Promise<Staking> {
    const poolContract = new Contract({
      abi: POOL_ABI,
      address: poolAddress,
      providerOrAccount: provider,
    }).typedv2(POOL_ABI);
    const poolParameters = await poolContract.contract_parameters_v1();

    const staker_address = fromAddress(poolParameters.staker_address);
    const staking_contract = fromAddress(poolParameters.staking_contract);

    if (staking_contract !== stakingContractAddress) {
      throw new Error("Staking contract address is wrong in the config.");
    }

    const stakingContract = new Contract({
      abi: STAKING_ABI,
      address: staking_contract,
      providerOrAccount: provider,
    }).typedv2(STAKING_ABI);

    const staker = await stakingContract.staker_pool_info(staker_address);
    const pool = staker.pools.find((pool) => {
      return fromAddress(pool.pool_contract) === poolAddress;
    });

    if (!pool) {
      throw new Error(`Could not verify pool address ${poolAddress}`);
    }

    if (fromAddress(pool.token_address) !== token.address) {
      throw new Error(
        `Pool ${poolAddress} does not hold ${token.symbol} tokens`
      );
    }

    return new Staking(poolContract, stakingContract, token, provider);
  }

  static async fromStaker(
    stakerAddress: Address,
    token: Token,
    provider: RpcProvider,
    stakingContractAddress: Address
  ): Promise<Staking> {
    const stakingContract = new Contract({
      abi: STAKING_ABI,
      address: stakingContractAddress,
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

    return new Staking(poolContract, stakingContract, token, provider);
  }

  static async activeTokens(
    provider: RpcProvider,
    chainId: ChainId,
    stakingContractAddress: Address
  ): Promise<Token[]> {
    const stakingContract = new Contract({
      abi: STAKING_ABI,
      address: stakingContractAddress,
      providerOrAccount: provider,
    }).typedv2(STAKING_ABI);

    const tokenAddresses = await stakingContract
      .get_active_tokens()
      .then((addresses) => {
        return addresses.map((address) => {
          return fromAddress(address);
        });
      });

    return await getTokensFromAddresses(chainId, tokenAddresses, provider);
  }
}
