import { defineConfig } from "vite";
import path from "path";

const sdkRoot = path.resolve(__dirname, "../..");

export default defineConfig({
  server: {
    allowedHosts: ["localhost", ".trycloudflare.com"],
  },
  resolve: {
    alias: {
      x: path.resolve(sdkRoot, "src/index.ts"),
      "@": path.resolve(sdkRoot, "src"),
    },
  },
  optimizeDeps: {
    exclude: ["x"],
  },
});
