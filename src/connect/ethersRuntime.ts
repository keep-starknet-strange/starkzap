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

  // NOTE: the import() must be wrapped in try/catch (not a .catch() chain):
  // webpack only downgrades an unresolvable dynamic import to a build warning
  // (with a runtime error) when the import() sits inside a try block — the
  // same pattern the Cartridge loader in src/wallet/cartridge.ts relies on.
  // With a .then()/.catch() chain instead, consumers without the optional
  // peer installed get a hard "Module not found" build error.
  loadingEthers ??= (async () => {
    try {
      const ethersModule = await import("ethers");
      cachedEthers = ethersModule as unknown as EthersModule;
      return cachedEthers;
    } catch {
      throw new Error(
        `[starkzap] ${feature} requires optional peer dependency "ethers". Install it with: npm i ethers`
      );
    } finally {
      loadingEthers = undefined;
    }
  })();

  return await loadingEthers;
}

/**
 * Returns the already-loaded ethers module synchronously.
 *
 * For sync code paths (constructors, static helpers) that cannot await
 * {@link loadEthers}. Safe wherever the caller already holds an ethers
 * object (a `Provider`, `Signer`, `Contract` or receipt) — such an object
 * cannot exist unless ethers was loaded — and in bridge classes, which are
 * only constructed after `BridgeOperator` has awaited `loadEthers`.
 */
export function requireEthers(feature: string): EthersModule {
  if (!cachedEthers) {
    throw new Error(
      `[starkzap] ${feature} requires optional peer dependency "ethers" to be loaded first. ` +
        `Install it with: npm i ethers`
    );
  }
  return cachedEthers;
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
