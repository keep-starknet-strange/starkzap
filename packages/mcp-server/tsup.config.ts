import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  // Bundle the workspace SDK to keep runtime resolution deterministic.
  noExternal: ["x"],
  target: "es2020",
  clean: true,
});
