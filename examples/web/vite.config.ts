import { defineConfig, type Plugin } from "vite";
import path from "path";
import { createRequire } from "module";
import { nodePolyfills } from "vite-plugin-node-polyfills";

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
  plugins: [nodePolyfills(), resolvePolyfillShims()],
  server: {
    allowedHosts: ["localhost", ".trycloudflare.com"],
    // Paycrest's API is server-to-server and sends no CORS headers, so a
    // direct browser call is blocked (and the `API-Key` header triggers a
    // preflight it won't answer). Proxy through the dev server so the
    // browser only ever talks to its own origin. The SDK's paycrest
    // apiBaseUrl points at `${origin}/paycrest-api` (see main.ts).
    proxy: {
      "/paycrest-api": {
        target: "https://api.paycrest.io",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/paycrest-api/, ""),
      },
    },
  },
  resolve: {
    alias: {
      starkzap: path.resolve(__dirname, "../../src/index.ts"),
      "@": path.resolve(__dirname, "../../src"),
    },
  },
  optimizeDeps: {
    exclude: ["starkzap"],
  },
  envPrefix: "VITE_",
});
