import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 120_000, // 2 minutes for blockchain tests
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/index.ts", // main barrel export only
        "src/types/**", // type-only files
        "src/erc20/**", // not implemented yet
        "src/staking/**", // not implemented yet
        "src/onramp/**", // not implemented yet
        "src/signer/index.ts", // barrel export
        "src/signer/interface.ts", // interface only
        "src/account/index.ts", // barrel export
        "src/token/index.ts", // barrel export
        // Wallet methods requiring network are tested in integration tests
        "src/wallet/index.ts",
      ],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      },
    },
  },
});
