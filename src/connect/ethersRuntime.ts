type EthersModule = typeof import("ethers");

let cachedEthers: EthersModule | undefined;
let loadingEthers: Promise<EthersModule> | undefined;

/**
 * Lazily loads ethers and caches the module namespace object.
 */
export async function loadEthers(feature: string): Promise<EthersModule> {
  if (cachedEthers) {
    return cachedEthers;
  }

  loadingEthers ??= import("ethers")
    .then((ethersModule) => {
      cachedEthers = ethersModule as unknown as EthersModule;
      return cachedEthers;
    })
    .catch(() => {
      throw new Error(
        `[starkzap] ${feature} requires optional peer dependency "ethers". Install it with: npm i ethers`
      );
    })
    .finally(() => {
      loadingEthers = undefined;
    });

  return await loadingEthers;
}

import type { EthereumAddress } from "@/types/address";

type EthersAddressLike = {
  getAddress(value: string): string;
};

/**
 * Parse and checksum-validate an Ethereum address using an explicit ethers runtime.
 * Internal SDK helper. Not exported from the public `@/types` barrel.
 */
export function fromEthereumAddress(
  value: string,
  ethers: EthersAddressLike
): EthereumAddress {
  return ethers.getAddress(value) as EthereumAddress;
}
