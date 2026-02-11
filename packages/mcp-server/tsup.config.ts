import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  // Bundle the local `x` SDK into the output so we don't depend on
  // Node.js resolving extensionless ESM imports from the parent package.
  noExternal: ["x"],
  target: "es2020",
  clean: true,
});
