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
