import { defineConfig } from "vite";
import path from "path";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [nodePolyfills()],
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
