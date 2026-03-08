import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      starkzap: new URL("../..", import.meta.url).pathname,
    },
  },
});
