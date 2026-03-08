import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      starkzap: fileURLToPath(new URL("../../src/index.ts", import.meta.url)),
    },
  },
});
