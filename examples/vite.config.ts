import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  server: {
    allowedHosts: ["localhost", ".trycloudflare.com"],
  },
  resolve: {
    alias: {
      x: path.resolve(__dirname, "../src/index.ts"),
    },
  },
  optimizeDeps: {
    exclude: ["x"],
  },
});
