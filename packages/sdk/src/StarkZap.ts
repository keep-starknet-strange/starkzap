import type { Account, Provider } from 'starknet';
import { ChainId, Network } from './types';
import { Staking } from './Staking';
import { getStakingPreset } from './stakingPreset';

export class StarkZap {
  readonly network: Network;
  private readonly account?: Account;
  private readonly provider?: Provider;

  constructor(params: {
    network: Network;
    account?: Account;
    provider?: Provider;
  }) {
    this.network = params.network;
    this.account = params.account;
    this.provider = params.provider;
  }

  getProvider(): Provider {
    if (!this.provider) {
      throw new Error(
        'A provider is required. Pass it via the StarkZap constructor or set it using setProvider().',
      );
    }
    return this.provider;
  }

  getChainId(): ChainId {
    return this.network === 'mainnet' ? ChainId.MAINNET : ChainId.SEPOLIA;
  }

  /**
   * Convenience method to create a Staking instance with minimal boilerplate.
   * Resolves the provider, chain ID, and staking preset automatically based on the configured network.
   *
   * @example
   * ```ts
   * const sdk = new StarkZap({ network: "sepolia", provider });
   * const staking = await sdk.getStaking(validatorAddress, tokenAddress);
   * ```
   */
  async getStaking(validatorAddress: string, tokenAddress: string): Promise<Staking> {
    const provider = this.getProvider();
    const chainId = this.getChainId();
    const config = getStakingPreset(chainId);
    return Staking.fromStaker(validatorAddress, tokenAddress, provider, config);
  }
}
