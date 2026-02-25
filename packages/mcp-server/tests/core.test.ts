import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Amount } from "starkzap";
import type { Token } from "starkzap";
import { describe, expect, it } from "vitest";
import {
  addressSchema,
  amountSchema,
  assertAmountWithinCap,
  assertBatchAmountWithinCap,
  assertPoolTokenHintMatches,
  assertSchemaParity,
  buildTools,
  createTokenResolver,
  extractPoolToken,
  getArg,
  isClassHashNotFoundError,
  normalizeStarknetAddress,
  parseCliConfig,
  requireResourceBounds,
  schemaParityMismatches,
  schemas,
  selectTools,
  STAKING_TOOLS,
  validateAddressBatch,
  validateAddressOrThrow,
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

  it("bounds calldata payload size", () => {
    const oversized = "a".repeat(257);
    const parsed = schemas.x_execute.safeParse({
      calls: [
        {
          contractAddress: TEST_TOKEN.address,
          entrypoint: "transfer",
          calldata: [oversized],
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it("validates calldata felt-like format", () => {
    const parsed = schemas.x_execute.safeParse({
      calls: [
        {
          contractAddress: TEST_TOKEN.address,
          entrypoint: "transfer",
          calldata: ["not-a-felt"],
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects bare 0x in address schema", () => {
    expect(addressSchema.safeParse("0x").success).toBe(false);
  });

  it("validates and normalizes a Starknet address", () => {
    const normalized = validateAddressOrThrow(
      "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
      "recipient"
    );
    expect(normalized.startsWith("0x")).toBe(true);
  });

  it("aggregates indexed address validation errors", () => {
    expect(() =>
      validateAddressBatch(
        [
          "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
          "0xINVALID",
        ],
        "recipient",
        "transfers.to"
      )
    ).toThrow(/transfers\.to\[1\]: Invalid recipient address/);
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

  it("does not expose write tools when only --enable-execute is set", () => {
    const tools = selectTools(buildTools("100", "150"), {
      enableWrite: false,
      enableExecute: true,
      stakingEnabled: true,
    });
    const names = new Set(tools.map((tool) => tool.name));
    expect(names.has("x_execute")).toBe(true);
    expect(names.has("x_transfer")).toBe(false);
    expect(names.has("x_enter_pool")).toBe(false);
  });
});

describe("amount and token guards", () => {
  it("rejects single amounts above max-amount", () => {
    const amount = Amount.parse("11", TEST_TOKEN);
    expect(() => assertAmountWithinCap(amount, TEST_TOKEN, "10")).toThrow(
      /per-operation cap/
    );
  });

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

  it("resolves tokens with non-canonical but semantically equal addresses", () => {
    const resolveToken = createTokenResolver("sepolia");
    const token = resolveToken("STRK");
    const nonCanonical = `0x${token.address.slice(2).replace(/^0+/, "")}`;
    const resolved = resolveToken(nonCanonical);
    expect(normalizeStarknetAddress(resolved.address)).toBe(
      normalizeStarknetAddress(token.address)
    );
  });

  it("accepts matching staking token hints with non-canonical formatting", () => {
    const resolveToken = createTokenResolver("sepolia");
    const poolToken = resolveToken("STRK");
    const hint = `0x${poolToken.address.slice(2).replace(/^0+/, "")}`;
    expect(() =>
      assertPoolTokenHintMatches(poolToken, hint, resolveToken)
    ).not.toThrow();
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

describe("staking token extraction guard", () => {
  it("prefers poolToken over other candidates", () => {
    const fallbackToken = {
      ...TEST_TOKEN,
      symbol: "ALT",
      address:
        "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcd" as Token["address"],
    };
    const stakingLike = {
      poolToken: TEST_TOKEN,
      tokenConfig: fallbackToken,
      token: fallbackToken,
    };
    expect(extractPoolToken(stakingLike)).toEqual(TEST_TOKEN);
  });

  it("returns undefined for non-object or invalid token shapes", () => {
    expect(extractPoolToken(null)).toBeUndefined();
    expect(
      extractPoolToken({ poolToken: { symbol: "BROKEN" } })
    ).toBeUndefined();
  });
});

describe("deploy error classification", () => {
  it("detects contract-not-found provider codes", () => {
    expect(isClassHashNotFoundError({ code: "CONTRACT_NOT_FOUND" })).toBe(true);
  });

  it("detects contract-not-found provider messages", () => {
    expect(
      isClassHashNotFoundError({
        message: "Contract not found for the provided address",
      })
    ).toBe(true);
  });

  it("does not classify transient rpc errors as not-found", () => {
    expect(
      isClassHashNotFoundError({
        message: "Gateway timeout while contacting RPC node",
      })
    ).toBe(false);
  });
});

describe("package publishability", () => {
  it("uses published starkzap dependency", () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.resolve(currentDir, "../package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.starkzap).toBeDefined();
    expect(pkg.devDependencies?.x).toBeUndefined();
  });
});
