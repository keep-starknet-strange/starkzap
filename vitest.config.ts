import { defineConfig } from "vitest/config";
import path from "path";

const alias = {
  "@": path.resolve(__dirname, "./src"),
};

export default defineConfig({
  resolve: { alias },
  test: {
    globals: true,
    environment: "node",
    projects: [
      // Unit tests - fast, no external dependencies
      {
        resolve: { alias },
        test: {
          name: {
            label: "unit",
            color: "blue",
          },
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/integration/**/*.test.ts", "**/node_modules/**"],
          testTimeout: 30_000,
        },
      },
      // Integration tests - requires devnet
      {
        resolve: { alias },
        test: {
          name: {
            label: "integration",
            color: "green",
          },
          include: ["tests/integration/**/*.test.ts"],
          // Sets up devnet instance shared accross all integration tests.
          globalSetup: "./tests/integration/globalSetup.ts",
          testTimeout: 300_000,
          hookTimeout: 60_000,
          sequence: {
            concurrent: true,
          },
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/index.ts",
        "src/types/**",
        "src/erc20/token/index.ts",
        "src/staking/**",
        "src/signer/index.ts",
        "src/signer/interface.ts",
        "src/account/index.ts",
        "src/token/index.ts",
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
