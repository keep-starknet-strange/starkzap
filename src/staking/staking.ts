import { Address, type ChainId, type Token } from "../types/index.js";
import { CairoFelt252, Contract, type RpcProvider } from "starknet";
import { ABI as STAKING_ABI } from "./abi/staking.js";
import { ABI as POOL_ABI } from "./abi/pool.js";
import { ABI as ERC20_ABI } from "./abi/erc20.js";
import { getPresets } from "../token/index.js";

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
    console.log("staker ", staker_address);
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

    const presetTokens = Object.values(getPresets(chainId));

    const tokens: Token[] = [];
    const unknownTokenAddresses: Address[] = [];

    for (const tokenAddress of tokenAddresses) {
      const token = presetTokens.find((preset) => {
        return preset.address === tokenAddress;
      });

      if (token) {
        tokens.push(token);
      } else {
        unknownTokenAddresses.push(tokenAddress);
      }
    }

    if (unknownTokenAddresses.length > 0) {
      const erc20Contracts = unknownTokenAddresses.map((address) => {
        return new Contract({
          abi: ERC20_ABI,
          address: address,
          providerOrAccount: provider,
        }).typedv2(ERC20_ABI);
      });

      const results = await Promise.all(
        erc20Contracts
          .map((contract) => {
            return [
              contract.name().then((name) => {
                return {
                  token: contract.address as Address,
                  type: "name",
                  value: new CairoFelt252(name).decodeUtf8(),
                };
              }),
              contract.symbol().then((symbol) => {
                return {
                  token: contract.address as Address,
                  type: "symbol",
                  value: new CairoFelt252(symbol).decodeUtf8(),
                };
              }),
              contract.decimals().then((decimals) => {
                return {
                  token: contract.address as Address,
                  type: "decimals",
                  value: decimals as number,
                };
              }),
            ];
          })
          .flat()
      );

      const tokenDetails = Map.groupBy(results, (r) => r.token);

      for (const unknownTokenAddress of unknownTokenAddresses) {
        const details = tokenDetails.get(unknownTokenAddress);
        if (details) {
          let name: string | null = null;
          let symbol: string | null = null;
          let decimals: number | null = null;

          for (const detail of details) {
            if (detail.type == "name" && typeof detail.value == "string") {
              name = detail.value;
            } else if (
              detail.type == "symbol" &&
              typeof detail.value == "string"
            ) {
              symbol = detail.value;
            } else if (
              detail.type == "decimals" &&
              typeof detail.value == "number"
            ) {
              decimals = detail.value;
            }
          }

          if (name && symbol && decimals) {
            tokens.push({
              name: name,
              address: unknownTokenAddress,
              decimals: decimals,
              symbol: symbol,
            });
          } else {
            console.warn("Could not determine token", unknownTokenAddress);
          }
        } else {
          console.warn("Could not determine token", unknownTokenAddress);
        }
      }
    }

    return tokens;
  }
}
