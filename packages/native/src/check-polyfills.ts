// Runtime guard for the polyfill footgun.
//
// withStarkzap (metro.cjs) only *hoists* polyfills already in Metro's module
// graph — it cannot inject them. If the app forgets to import them at its
// entry, they never run.
//
// We assert exactly one polyfill: fast-text-encoding. It is the only one that
// is both
// (a) needed by every StarkZap flow as starknet computes an entrypoint
// selector via `new TextEncoder().encode(name)` on every contract read/write
// (getSelectorFromName → starknetKeccak), and
// (b) cryptic when missing (a bare "TextEncoder is not defined" from deep
// inside starknet, no hint it's a polyfill).
//
// Other polyfills are feature-gated
// - react-native-get-random-values: Cartridge/paymaster/keygen — and noble
// already throws a clear "crypto.getRandomValues must be defined"
// - buffer/@ethersproject/shims: bridge only
if (
  typeof (globalThis as { TextEncoder?: unknown }).TextEncoder !== "function"
) {
  console.warn(
    `[starkzap-native] Missing required polyfill, starknet will crash.\n` +
      `Add this once at your app entry, before any StarkZap usage:\n` +
      `  import "fast-text-encoding";`
  );
}
