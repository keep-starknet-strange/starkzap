import { Contract, type RpcProvider } from "starknet";
import { getTokensFromAddresses } from "../erc20/index.js";
import { Address, type ChainId, type Token } from "../types/index.js";
import { ABI as POOL_ABI } from "../abi/pool.js";
import { ABI as STAKING_ABI } from "../abi/staking.js";

export class Staking {
  private readonly pool: Contract;
  private readonly token: Token;

  private readonly provider: RpcProvider;

  private constructor(
    pool: Contract,
    tokenAddress: Token,
    provider: RpcProvider
  ) {
    this.pool = pool;
    this.token = tokenAddress;
    this.provider = provider;
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

    const staker_address = Address.from(poolParameters.staker_address);
    const staking_contract = Address.from(poolParameters.staking_contract);

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
      return Address.from(pool.pool_contract) === poolAddress;
    });

    if (!pool) {
      throw new Error(`Could not verify pool address ${poolAddress}`);
    }

    if (Address.from(pool.token_address) !== token.address) {
      throw new Error(
        `Pool ${poolAddress} does not hold ${token.symbol} tokens`
      );
    }

    return new Staking(poolContract, token, provider);
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
      return Address.from(pool.token_address) === token.address;
    });

    if (!pool) {
      throw new Error(
        `No pool exists by staker ${stakerAddress} for ${token.symbol}`
      );
    }

    const poolContract = new Contract({
      abi: POOL_ABI,
      address: Address.from(pool.pool_contract),
      providerOrAccount: provider,
    }).typedv2(POOL_ABI);

    return new Staking(poolContract, token, provider);
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
          return Address.from(address);
        });
      });

    return await getTokensFromAddresses(chainId, tokenAddresses, provider);
  }
}
