import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Amount } from "starkzap";
import type { Token } from "starkzap";
import { describe, expect, it, vi } from "vitest";
import {
  addressSchema,
  amountSchema,
  assertAmountWithinCap,
  assertBatchAmountWithinCap,
  assertStakingPoolShape,
  assertPoolTokenHintMatches,
  assertSchemaParity,
  buildTools,
  createTokenResolver,
  enforcePerMinuteRateLimit,
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
  it("fails fast when a value flag is present without a value", () => {
    expect(() =>
      getArg(["--max-amount", "--enable-write"], "max-amount", "1000")
    ).toThrow(/Missing value for flag --max-amount/);
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
    expect(cli.rateLimitRpm).toBe(0);
    expect(cli.readRateLimitRpm).toBe(0);
    expect(cli.writeRateLimitRpm).toBe(0);
    expect(cli.enableWrite).toBe(true);
  });

  it("parses optional --rate-limit-rpm", () => {
    const cli = parseCliConfig([
      "--network",
      "mainnet",
      "--rate-limit-rpm",
      "120",
    ]);
    expect(cli.rateLimitRpm).toBe(120);
  });

  it("parses optional split read/write rate limits", () => {
    const cli = parseCliConfig([
      "--network",
      "mainnet",
      "--read-rate-limit-rpm",
      "30",
      "--write-rate-limit-rpm",
      "10",
    ]);
    expect(cli.readRateLimitRpm).toBe(30);
    expect(cli.writeRateLimitRpm).toBe(10);
  });

  it("fails fast on unknown CLI flags", () => {
    expect(() =>
      parseCliConfig(["--network", "sepolia", "--wat", "1"])
    ).toThrow(/Unknown flag --wat/);
  });

  it("wraps max-amount parser failures with CLI context", () => {
    const parseSpy = vi.spyOn(Amount, "parse").mockImplementation(() => {
      throw new Error("precision overflow");
    });
    expect(() =>
      parseCliConfig(["--network", "sepolia", "--max-amount", "1.5"])
    ).toThrow(/Invalid --max-amount value "1\.5"\. precision overflow/);
    parseSpy.mockRestore();
  });

  it("fails fast on extremely high rate-limit-rpm", () => {
    expect(() => parseCliConfig(["--rate-limit-rpm", "10001"])).toThrow(
      /Must be <= 10000/
    );
  });

  it("fails fast on extremely high split read/write rate limits", () => {
    expect(() => parseCliConfig(["--read-rate-limit-rpm", "10001"])).toThrow(
      /Must be <= 10000/
    );
    expect(() => parseCliConfig(["--write-rate-limit-rpm", "10001"])).toThrow(
      /Must be <= 10000/
    );
  });
});

describe("schema hardening", () => {
  it("rejects zero amount values", () => {
    const parsed = amountSchema.safeParse("0");
    expect(parsed.success).toBe(false);
  });

  it("rejects overly long amount literals", () => {
    const parsed = amountSchema.safeParse("9".repeat(33));
    expect(parsed.success).toBe(false);
  });

  it("bounds estimate-fee calls at 10", () => {
    const calls = Array.from({ length: 11 }, () => ({
      contractAddress: TEST_TOKEN.address,
      entrypoint: "transfer",
      calldata: [],
    }));
    const parsed = schemas.starkzap_estimate_fee.safeParse({ calls });
    expect(parsed.success).toBe(false);
  });

  it("bounds calldata payload size", () => {
    const oversized = "a".repeat(257);
    const parsed = schemas.starkzap_execute.safeParse({
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
    const parsed = schemas.starkzap_execute.safeParse({
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

  it("validates entrypoint identifier format", () => {
    const parsed = schemas.starkzap_execute.safeParse({
      calls: [
        {
          contractAddress: TEST_TOKEN.address,
          entrypoint: " transfer",
          calldata: [],
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
  it("always exposes starkzap_get_account as a read-only tool", () => {
    const readOnlyOnly = selectTools(buildTools("100", "150"), {
      enableWrite: false,
      enableExecute: false,
      stakingEnabled: false,
    });
    const names = new Set(readOnlyOnly.map((tool) => tool.name));
    expect(names.has("starkzap_get_account")).toBe(true);
  });

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
    expect(names.has("starkzap_execute")).toBe(true);
    expect(names.has("starkzap_transfer")).toBe(false);
    expect(names.has("starkzap_enter_pool")).toBe(false);
  });

  it("includes MCP tool annotations for safety-aware clients", () => {
    const tools = buildTools("100", "150");
    for (const tool of tools) {
      expect(tool.annotations).toBeDefined();
      expect(typeof tool.annotations?.readOnlyHint).toBe("boolean");
      expect(typeof tool.annotations?.destructiveHint).toBe("boolean");
    }
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

  it("accepts numeric caps in amount helpers", () => {
    const amount = Amount.parse("9", TEST_TOKEN);
    expect(() => assertAmountWithinCap(amount, TEST_TOKEN, 10)).not.toThrow();
  });

  it("keeps unknown token errors concise", () => {
    const resolveToken = createTokenResolver("sepolia");
    try {
      resolveToken("THIS_TOKEN_DOES_NOT_EXIST");
      throw new Error("Expected token resolution to fail");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toMatch(/Unknown token/);
      expect(message.length).toBeLessThan(320);
      expect(message).not.toContain("(+");
    }
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

  it("throws when resource bounds fields are not bigint", () => {
    expect(() =>
      requireResourceBounds({
        resourceBounds: {
          l1_gas: { max_amount: "1", max_price_per_unit: "2" },
          l2_gas: { max_amount: "1", max_price_per_unit: "2" },
          l1_data_gas: { max_amount: "1", max_price_per_unit: "2" },
        },
      })
    ).toThrow(/invalid resourceBounds bigint types/);
  });

  it("accepts valid bigint resource bounds", () => {
    expect(() =>
      requireResourceBounds({
        resourceBounds: {
          l1_gas: { max_amount: 1n, max_price_per_unit: 2n },
          l2_gas: { max_amount: 3n, max_price_per_unit: 4n },
          l1_data_gas: { max_amount: 5n, max_price_per_unit: 6n },
        },
      })
    ).not.toThrow();
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

  it("validates staking pool interface shape and pool address", () => {
    const stakingLike = {
      enter: () => undefined,
      add: () => undefined,
      claimRewards: () => undefined,
      exitIntent: () => undefined,
      exit: () => undefined,
      getPosition: () => undefined,
      poolAddress: TEST_TOKEN.address,
    };
    expect(() =>
      assertStakingPoolShape(stakingLike, TEST_TOKEN.address)
    ).not.toThrow();
    expect(() =>
      assertStakingPoolShape(
        { ...stakingLike, poolAddress: "0x1" },
        TEST_TOKEN.address
      )
    ).toThrow(/resolved to/);
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

describe("rate limiting", () => {
  it("allows calls under limit and blocks calls over limit", () => {
    const bucket: number[] = [];
    enforcePerMinuteRateLimit(bucket, 1_000, 2);
    enforcePerMinuteRateLimit(bucket, 2_000, 2);
    expect(() => enforcePerMinuteRateLimit(bucket, 3_000, 2)).toThrow(
      /Rate limit exceeded/
    );
  });

  it("evicts stale timestamps after one minute window", () => {
    const bucket: number[] = [];
    enforcePerMinuteRateLimit(bucket, 1_000, 1);
    expect(() => enforcePerMinuteRateLimit(bucket, 2_000, 1)).toThrow();
    expect(() => enforcePerMinuteRateLimit(bucket, 62_000, 1)).not.toThrow();
  });

  it("trims overgrown buckets before evaluating rate-limit", () => {
    const bucket = Array.from({ length: 100 }, () => 10_000);
    expect(() => enforcePerMinuteRateLimit(bucket, 11_000, 2)).toThrow();
    expect(bucket.length).toBeLessThanOrEqual(34);
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
