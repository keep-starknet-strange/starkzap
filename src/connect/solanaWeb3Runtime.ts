type SolanaWeb3Module = typeof import("@solana/web3.js");

let cachedSolanaWeb3: SolanaWeb3Module | undefined;
let loadingSolanaWeb3: Promise<SolanaWeb3Module> | undefined;

/**
 * Lazily loads @solana/web3.js and caches the module namespace object.
 */
export async function loadSolanaWeb3(
  feature: string
): Promise<SolanaWeb3Module> {
  if (cachedSolanaWeb3) {
    return cachedSolanaWeb3;
  }

  loadingSolanaWeb3 ??= import("@solana/web3.js")
    .then((module) => {
      cachedSolanaWeb3 = module as unknown as SolanaWeb3Module;
      return cachedSolanaWeb3;
    })
    .catch(() => {
      throw new Error(
        `[starkzap] ${feature} requires optional peer dependency "@solana/web3.js". Install it with: npm i @solana/web3.js`
      );
    })
    .finally(() => {
      loadingSolanaWeb3 = undefined;
    });

  return await loadingSolanaWeb3;
}
