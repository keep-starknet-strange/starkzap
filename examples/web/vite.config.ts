import { defineConfig, type Plugin } from "vite";
import path from "path";
import { createRequire } from "module";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import mkcert from "vite-plugin-mkcert";

const require = createRequire(import.meta.url);

function resolvePolyfillShims(): Plugin {
  return {
    name: "resolve-polyfill-shims",
    resolveId(source) {
      if (source.startsWith("vite-plugin-node-polyfills/shims/")) {
        return require.resolve(source).replace(/\.cjs$/, ".js");
      }
    },
  };
}

export default defineConfig({
  // Cartridge's keychain login uses WebAuthn/passkeys, which browsers refuse on
  // any origin with a TLS certificate error. A self-signed cert (basicSsl) is
  // NOT enough — WebAuthn needs a *trusted* cert. mkcert installs a local CA
  // and issues a trusted localhost cert, so https://localhost has no cert error.
  plugins: [mkcert(), svelte(), nodePolyfills(), resolvePolyfillShims()],
  server: {
    allowedHosts: ["localhost", ".trycloudflare.com"],
    // Vite serves HTTPS over HTTP/2 (`http2.createSecureServer`, unconditional
    // in v7). Browsers won't open a WebSocket over an h2 connection without
    // RFC 8441 extended CONNECT, which node's http2 server doesn't enable, so
    // HMR silently fails to connect while the page itself loads fine. Giving
    // HMR its own port makes Vite spin up a standalone HTTP/1.1 TLS server for
    // it (reusing the mkcert cert), where the WebSocket upgrade works.
    hmr: { port: 24678 },
  },
  resolve: {
    alias: {
      starkzap: path.resolve(__dirname, "../../src/index.ts"),
      "@": path.resolve(__dirname, "../../src"),
      "~": path.resolve(__dirname, "src"),
    },
  },
  optimizeDeps: {
    exclude: ["starkzap"],
    // The SDK reaches its optional peers through `await import(...)` inside
    // lazy loaders. Vite's scanner only pre-bundles statically imported bare
    // specifiers, so these are discovered at runtime instead — triggering a
    // second optimize pass that changes the dep hashes, 504s every module
    // request already in flight ("Outdated Optimize Dep") and force-reloads
    // the page. Listing them here puts them in the first pass, so there is
    // no second pass and no 504.
    include: [
      "@avnu/avnu-sdk",
      "@cartridge/controller",
      "@fatsolutions/tongo-sdk",
      "@hyperlane-xyz/registry",
      "@hyperlane-xyz/sdk",
      "@hyperlane-xyz/utils",
      "@solana/web3.js",
      "ethers",
    ],
  },
  envPrefix: "VITE_",
});
