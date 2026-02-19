import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
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
});
