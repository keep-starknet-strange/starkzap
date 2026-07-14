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
  },
  envPrefix: "VITE_",
});
