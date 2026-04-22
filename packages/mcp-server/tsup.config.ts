import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  // Keep runtime dependencies external. Bundling StarkZap pulls websocket
  // internals into the ESM artifact and breaks Node startup on real MCP runs.
  noExternal: ["starkzap"],
  platform: "node",
  target: "es2020",
  skipNodeModulesBundle: true,
  clean: true,
});
