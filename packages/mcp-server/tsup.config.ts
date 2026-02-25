import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  // Bundle StarkZap SDK to keep runtime resolution deterministic for npx usage.
  noExternal: ["starkzap"],
  target: "es2020",
  clean: true,
});
