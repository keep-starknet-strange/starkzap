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

  // NOTE: the import() must be wrapped in try/catch (not a .catch() chain):
  // webpack only downgrades an unresolvable dynamic import to a build warning
  // (with a runtime error) when the import() sits inside a try block — the
  // same pattern the Cartridge loader in src/wallet/cartridge.ts relies on.
  // With a .then()/.catch() chain instead, consumers without the optional
  // peer installed get a hard "Module not found" build error.
  loadingSolanaWeb3 ??= (async () => {
    try {
      const module = await import("@solana/web3.js");
      cachedSolanaWeb3 = module as unknown as SolanaWeb3Module;
      return cachedSolanaWeb3;
    } catch {
      throw new Error(
        `[starkzap] ${feature} requires optional peer dependency "@solana/web3.js". Install it with: npm i @solana/web3.js`
      );
    } finally {
      loadingSolanaWeb3 = undefined;
    }
  })();

  return await loadingSolanaWeb3;
}
