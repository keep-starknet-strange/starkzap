import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Amount } from "x";
import type { Token } from "x";
import { describe, expect, it } from "vitest";
import {
  amountSchema,
  assertBatchAmountWithinCap,
  assertPoolTokenHintMatches,
  assertSchemaParity,
  buildTools,
  createTokenResolver,
  getArg,
  parseCliConfig,
  requireResourceBounds,
  schemaParityMismatches,
  schemas,
  selectTools,
  STAKING_TOOLS,
} from "../src/core.js";

const TEST_TOKEN: Token = {
  name: "STRK",
  symbol: "STRK",
  address:
    "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab0720189f9f3f75e66" as Token["address"],
  decimals: 18,
};

describe("CLI parsing", () => {
  it("treats a flag-like value as missing and falls back", () => {
    const value = getArg(
      ["--max-amount", "--enable-write"],
      "max-amount",
      "1000"
    );
    expect(value).toBe("1000");
  });

  it("fails fast on invalid network values", () => {
    expect(() => parseCliConfig(["--network", "invalid"])).toThrow(
      /Invalid --network value/
    );
  });

  it("parses max-batch-amount and validates it as positive", () => {
    const cli = parseCliConfig([
      "--network",
      "sepolia",
      "--max-amount",
      "10",
      "--max-batch-amount",
      "15",
      "--enable-write",
    ]);
    expect(cli.maxAmount).toBe("10");
    expect(cli.maxBatchAmount).toBe("15");
    expect(cli.enableWrite).toBe(true);
  });
});

describe("schema hardening", () => {
  it("rejects zero amount values", () => {
    const parsed = amountSchema.safeParse("0");
    expect(parsed.success).toBe(false);
  });

  it("bounds estimate-fee calls at 10", () => {
    const calls = Array.from({ length: 11 }, () => ({
      contractAddress: TEST_TOKEN.address,
      entrypoint: "transfer",
      calldata: [],
    }));
    const parsed = schemas.x_estimate_fee.safeParse({ calls });
    expect(parsed.success).toBe(false);
  });
});

describe("tool gating and parity", () => {
  it("hides staking tools when staking config is absent", () => {
    const tools = selectTools(buildTools("100", "150"), {
      enableWrite: true,
      enableExecute: false,
      stakingEnabled: false,
    });
    const names = new Set(tools.map((tool) => tool.name));
    for (const stakingTool of STAKING_TOOLS) {
      expect(names.has(stakingTool)).toBe(false);
    }
  });

  it("keeps zod schemas and MCP input schemas in parity", () => {
    const tools = buildTools("100", "150");
    expect(schemaParityMismatches(tools)).toEqual([]);
    expect(() => assertSchemaParity(tools)).not.toThrow();
  });
});

describe("amount and token guards", () => {
  it("rejects transfer batches above max-batch-amount", () => {
    const amounts = [
      Amount.parse("6", TEST_TOKEN),
      Amount.parse("5", TEST_TOKEN),
    ];
    expect(() => assertBatchAmountWithinCap(amounts, TEST_TOKEN, "10")).toThrow(
      /batch cap/
    );
  });

  it("rejects staking token hints that do not match the pool token", () => {
    const resolveToken = createTokenResolver("sepolia");
    const poolToken = resolveToken("STRK");
    expect(() =>
      assertPoolTokenHintMatches(poolToken, "USDC", resolveToken)
    ).toThrow(/does not match pool token/);
  });
});

describe("fee response guard", () => {
  it("throws when resource bounds are missing", () => {
    expect(() =>
      requireResourceBounds({
        overall_fee: 1n,
        unit: "wei",
      })
    ).toThrow(/missing resourceBounds/);
  });
});

describe("package publishability", () => {
  it("documents workspace-only dependency mode", () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const readmePath = path.resolve(currentDir, "../README.md");
    const readme = fs.readFileSync(readmePath, "utf8");
    expect(readme).toContain("workspace-only");

    const pkgPath = path.resolve(currentDir, "../package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.devDependencies?.x).toBe("file:../../");
  });
});
