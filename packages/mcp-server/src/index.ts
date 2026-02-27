#!/usr/bin/env node

/**
 * StarkZap MCP Server
 *
 * Exposes Starknet wallet operations as MCP tools via the StarkZap SDK.
 * Works with any MCP-compatible client: Claude, Cursor, OpenAI Agents SDK, etc.
 *
 * Usage:
 *   STARKNET_PRIVATE_KEY=0x... npx @keep-starknet-strange/starkzap-mcp --network mainnet
 */

import { fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { Amount, fromAddress, StarkSDK, StarkSigner } from "starkzap";
import type { Address, Token, Wallet } from "starkzap";
import {
  assertStakingPoolShape,
  assertAmountWithinCap,
  assertBatchAmountWithinCap,
  assertPoolTokenHintMatches,
  assertSchemaParity,
  buildTools,
  createTokenResolver,
  enforcePerMinuteRateLimit,
  extractPoolToken,
  FELT_REGEX,
  formatZodError,
  isClassHashNotFoundError,
  parseCliConfig,
  READ_ONLY_TOOLS,
  requireResourceBounds,
  schemas,
  selectTools,
  STAKING_TOOLS,
  validateAddressBatch,
  validateAddressOrThrow,
} from "./core.js";

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const cliArgs = process.argv.slice(2);
const STARK_CURVE_ORDER = BigInt(
  "0x0800000000000011000000000000000000000000000000000000000000000001"
);

const cliConfig = (() => {
  try {
    return parseCliConfig(cliArgs);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exit(1);
  }
})();

const {
  network,
  enableWrite,
  enableExecute,
  maxAmount,
  maxBatchAmount,
  rateLimitRpm,
  readRateLimitRpm,
  writeRateLimitRpm,
} = cliConfig;

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const privateKeySchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "Must be a 0x-prefixed 32-byte hex private key")
  .refine((value) => {
    const key = BigInt(value);
    return key !== 0n && key < STARK_CURVE_ORDER;
  }, "Private key must be cryptographically valid (non-zero and less than Stark curve order)");

const contractAddressSchema = z
  .string()
  .regex(FELT_REGEX, "Must be a 0x-prefixed hex string (1-64 hex chars)")
  .refine(
    (value) => {
      try {
        fromAddress(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Invalid Starknet contract address" }
  );

function isSecureRpcUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === "https:") {
      return true;
    }
    if (url.protocol === "http:") {
      const hostname = url.hostname.toLowerCase();
      return (
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1"
      );
    }
    return false;
  } catch {
    return false;
  }
}

const envSchema = z.object({
  STARKNET_PRIVATE_KEY: privateKeySchema,
  STARKNET_RPC_URL: z
    .string()
    .url()
    .refine(
      (value) => isSecureRpcUrl(value),
      "RPC URL must use HTTPS (HTTP is only allowed for localhost)"
    )
    .optional(),
  STARKNET_STAKING_CONTRACT: contractAddressSchema.optional(),
  STARKNET_STAKING_POOL_CLASS_HASHES: z.string().optional(),
  STARKNET_POOL_CACHE_TTL_MS: z.coerce
    .number()
    .int()
    .min(0)
    .max(3_600_000)
    .optional(),
  STARKNET_RPC_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .max(300_000)
    .optional(),
});

const env = (() => {
  const envInput = {
    ...process.env,
    STARKNET_PRIVATE_KEY: process.env.STARKNET_PRIVATE_KEY,
  };
  delete process.env.STARKNET_PRIVATE_KEY;
  const parsed = envSchema.safeParse(envInput);
  if (parsed.success) {
    return parsed.data;
  }
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
    .join("; ");
  console.error(`Error: invalid environment configuration: ${details}`);
  process.exit(1);
})();
// `env` is a flat object today; shallow freeze is enough unless nested fields are added.
Object.freeze(env);

function parsePoolClassHashAllowlist(
  raw: string | undefined
): ReadonlySet<string> {
  if (!raw) {
    return new Set();
  }
  const values = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.length === 0) {
    return new Set();
  }
  const normalized = new Set<string>();
  for (const value of values) {
    if (!FELT_REGEX.test(value)) {
      throw new Error(
        `Invalid STARKNET_STAKING_POOL_CLASS_HASHES entry "${value}". Must be a felt-like hex string (0x...).`
      );
    }
    normalized.add(fromAddress(value));
  }
  return normalized;
}

const configuredPoolClassHashes = (() => {
  try {
    return parsePoolClassHashAllowlist(env.STARKNET_STAKING_POOL_CLASS_HASHES);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: invalid environment configuration: ${message}`);
    process.exit(1);
  }
})();

const stakingEnabled = Boolean(env.STARKNET_STAKING_CONTRACT);
const rpcTimeoutMs = env.STARKNET_RPC_TIMEOUT_MS ?? 30_000;
const poolClassHashCacheTtlMs = env.STARKNET_POOL_CACHE_TTL_MS ?? 30_000;
let nowProvider = () => Date.now();
let stakingReferenceClassHashPromise: Promise<string | undefined> | undefined;
const poolClassHashCache = new Map<
  Address,
  { hash: string; expiresAtMs: number }
>();
const poolClassHashInFlight = new Map<Address, Promise<string>>();

// ---------------------------------------------------------------------------
// SDK + wallet singleton (lazy init)
// ---------------------------------------------------------------------------
let sdkSingleton: StarkSDK | undefined;
let walletSingleton: Wallet | undefined;
let walletInitPromise: Promise<Wallet> | undefined;
let walletInitFailureCount = 0;
let walletInitBackoffUntilMs = 0;
let sdkInitFailureCount = 0;
let sdkInitBackoffUntilMs = 0;
const sdkConfig = Object.freeze({
  network,
  ...(env.STARKNET_RPC_URL && { rpcUrl: env.STARKNET_RPC_URL }),
  ...(env.STARKNET_STAKING_CONTRACT && {
    staking: {
      contract: fromAddress(env.STARKNET_STAKING_CONTRACT),
    },
  }),
});

function getSdk(): StarkSDK {
  if (sdkInitBackoffUntilMs > nowMs()) {
    const retryInMs = sdkInitBackoffUntilMs - nowMs();
    throw new Error(
      `SDK initialization temporarily throttled after recent failures. Retry in ${Math.ceil(retryInMs / 1000)}s.`
    );
  }
  if (!sdkSingleton) {
    try {
      sdkSingleton = new StarkSDK(sdkConfig);
      sdkInitFailureCount = 0;
      sdkInitBackoffUntilMs = 0;
    } catch (error) {
      sdkInitFailureCount = Math.min(sdkInitFailureCount + 1, 10);
      const backoffMs = Math.min(300_000, 500 * 2 ** (sdkInitFailureCount - 1));
      sdkInitBackoffUntilMs = nowMs() + backoffMs;
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `SDK initialization failed. ${reason} Retry in ${Math.ceil(backoffMs / 1000)}s.`
      );
    }
  }
  return sdkSingleton;
}

function withTimeoutMessage(operation: string, timeoutMs: number): string {
  return `${operation} timed out after ${timeoutMs}ms`;
}

function nowMs(): number {
  return nowProvider();
}

async function withTimeout<T>(
  operation: string,
  promiseFactory: () => Promise<T>,
  timeoutMs: number = rpcTimeoutMs
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(withTimeoutMessage(operation, timeoutMs)));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promiseFactory(), timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function summarizeError(error: unknown): string {
  const stringifySafe = (value: unknown): string => {
    try {
      return JSON.stringify(value, (_, current) =>
        typeof current === "bigint" ? current.toString() : current
      );
    } catch {
      return String(value);
    }
  };
  const raw =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === "string"
        ? error
        : stringifySafe(error);
  return raw
    .replace(/https?:\/\/[^\s)]+/gi, "<url>")
    .replace(/\[[\da-fA-F:]+\](?::\d{2,5})?/gi, "<host>")
    .replace(
      /\b(?:localhost|::1|(?:\d{1,3}\.){3}\d{1,3})(?::\d{2,5})?\b/gi,
      "<host>"
    )
    .replace(
      /(?<![\\/])\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d{2,5})?\b/gi,
      "<host>"
    )
    .slice(0, 1024);
}

function createErrorReference(message: string): string {
  return createHash("sha256").update(message).digest("hex").slice(0, 16);
}

function sanitizeExplorerUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) {
    return undefined;
  }
  if (rawUrl.length > 512) {
    console.error("[starkzap-mcp] dropping excessively long explorerUrl");
    return undefined;
  }
  try {
    const parsed = new URL(rawUrl);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== "https:" && protocol !== "http:") {
      console.error(
        `[starkzap-mcp] dropping unsafe explorerUrl protocol "${protocol}" returned by SDK`
      );
      return undefined;
    }
    if (parsed.username || parsed.password) {
      console.error(
        "[starkzap-mcp] dropping explorerUrl containing credentials"
      );
      return undefined;
    }
    return rawUrl;
  } catch {
    console.error(
      "[starkzap-mcp] dropping malformed explorerUrl returned by SDK"
    );
    return undefined;
  }
}

async function getWallet(): Promise<Wallet> {
  if (walletSingleton) {
    return walletSingleton;
  }
  if (walletInitBackoffUntilMs > nowMs()) {
    const retryInMs = walletInitBackoffUntilMs - nowMs();
    throw new Error(
      `Wallet initialization temporarily throttled after recent failures. Retry in ${Math.ceil(retryInMs / 1000)}s.`
    );
  }
  if (!walletInitPromise) {
    walletInitPromise = withTimeout("Wallet initialization", () =>
      getSdk().connectWallet({
        account: {
          signer: new StarkSigner(env.STARKNET_PRIVATE_KEY),
        },
      })
    )
      .then((wallet) => {
        walletSingleton = wallet;
        walletInitFailureCount = 0;
        walletInitBackoffUntilMs = 0;
        walletInitPromise = undefined;
        return wallet;
      })
      .catch((error) => {
        walletInitPromise = undefined;
        walletInitFailureCount = Math.min(walletInitFailureCount + 1, 8);
        const backoffMs = Math.min(
          300_000,
          500 * 2 ** (walletInitFailureCount - 1)
        );
        walletInitBackoffUntilMs = nowMs() + backoffMs;
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Wallet initialization failed. ${reason} Retry in ${Math.ceil(backoffMs / 1000)}s.`
        );
      });
  }
  return walletInitPromise;
}

async function assertWalletAccountClassHash(
  wallet: Wallet,
  context: string
): Promise<void> {
  const provider = wallet.getProvider();
  let deployedClassHash: string;
  try {
    deployedClassHash = fromAddress(
      await withTimeout("Wallet account class-hash verification", () =>
        provider.getClassHashAt(wallet.address)
      )
    );
  } catch (error) {
    if (isClassHashNotFoundError(error)) {
      throw new Error(
        `${context} succeeded but wallet account is still not deployed on-chain.`
      );
    }
    throw error;
  }
  const expectedClassHash = fromAddress(wallet.getClassHash());
  if (deployedClassHash !== expectedClassHash) {
    throw new Error(
      `${context} detected account class hash mismatch at ${wallet.address}. expected=${expectedClassHash} actual=${deployedClassHash}`
    );
  }
}

// ---------------------------------------------------------------------------
// Tool definitions + gates
// ---------------------------------------------------------------------------
const resolveToken = createTokenResolver(network);
const allTools = buildTools(maxAmount, maxBatchAmount);
assertSchemaParity(allTools);

const tools = selectTools(allTools, {
  enableWrite,
  enableExecute,
  stakingEnabled,
});

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------
const TX_WAIT_TIMEOUT_MS = 120_000;
const WALLET_DISCONNECT_TIMEOUT_MS = 5_000;
const activeTransactionHashes = new Set<string>();
const timedOutTransactionHashes = new Set<string>();
let cleanupPromise: Promise<void> | undefined;

class TransactionWaitTimeoutError extends Error {
  constructor(
    readonly txHash: string,
    readonly timeoutMs: number
  ) {
    super(`Transaction ${txHash} confirmation timed out after ${timeoutMs}ms`);
    this.name = "TransactionWaitTimeoutError";
  }
}

function normalizeTransactionHash(hash: string): string {
  if (!FELT_REGEX.test(hash)) {
    throw new Error(`Invalid transaction hash returned by SDK: "${hash}"`);
  }
  const normalized = fromAddress(hash);
  if (BigInt(normalized) === 0n) {
    throw new Error(`Invalid transaction hash returned by SDK: "${hash}"`);
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

type AmountMethod =
  | "toUnit"
  | "toFormatted"
  | "toBase"
  | "getDecimals"
  | "gt"
  | "add"
  | "eq"
  | "isZero";

function assertAmountMethods(
  value: unknown,
  label: string,
  methods: readonly AmountMethod[]
): asserts value is Amount {
  if (!isRecord(value)) {
    throw new Error(
      `Invalid ${label} returned by SDK: expected Amount-like object.`
    );
  }
  for (const method of methods) {
    if (typeof value[method] !== "function") {
      throw new Error(
        `Invalid ${label} returned by SDK: missing Amount method "${method}".`
      );
    }
  }
}

function parseAmountWithContext(
  literal: string,
  token: Token,
  context: string
): Amount {
  try {
    return Amount.parse(literal, token);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Invalid ${context} amount "${literal}" for ${token.symbol}. ${reason}`
    );
  }
}

function assertOverallFeeIsBigInt(fee: unknown): asserts fee is {
  overall_fee: bigint;
} {
  if (!isRecord(fee) || typeof fee.overall_fee !== "bigint") {
    throw new Error(
      `Fee estimate response has invalid overall_fee type. Response: ${summarizeError(fee)}`
    );
  }
}

function assertPoolPositionShape(
  position: unknown,
  poolAddress: Address
): asserts position is {
  staked: Amount;
  rewards: Amount;
  total: Amount;
  unpooling: Amount;
  commissionPercent: number;
  unpoolTime?: Date | null;
} {
  if (!isRecord(position)) {
    throw new Error(
      `Invalid pool position response from SDK for ${poolAddress}: expected object.`
    );
  }

  assertAmountMethods(position.staked, "pool position staked", [
    "toUnit",
    "toFormatted",
  ]);
  assertAmountMethods(position.rewards, "pool position rewards", [
    "toUnit",
    "toFormatted",
    "gt",
    "eq",
    "add",
    "isZero",
  ]);
  assertAmountMethods(position.total, "pool position total", [
    "toUnit",
    "toFormatted",
  ]);
  assertAmountMethods(position.unpooling, "pool position unpooling", [
    "toUnit",
    "isZero",
    "gt",
    "eq",
    "add",
  ]);

  if (
    position.unpoolTime !== undefined &&
    position.unpoolTime !== null &&
    (!(position.unpoolTime instanceof Date) ||
      Number.isNaN(position.unpoolTime.getTime()))
  ) {
    throw new Error(
      `Invalid pool position response from SDK for ${poolAddress}: unpoolTime must be a valid Date or null.`
    );
  }

  if (
    typeof position.commissionPercent !== "number" ||
    !Number.isFinite(position.commissionPercent) ||
    position.commissionPercent < 0 ||
    position.commissionPercent > 100
  ) {
    throw new Error(
      `Invalid pool position response from SDK for ${poolAddress}: commissionPercent must be a finite number between 0 and 100.`
    );
  }
}

async function waitForTrackedTransaction(tx: {
  wait: () => Promise<void>;
  hash: string;
  explorerUrl?: string;
}): Promise<{ hash: string; explorerUrl?: string }>;
async function waitForTrackedTransaction(
  tx: {
    wait: () => Promise<void>;
    hash: string;
    explorerUrl?: string;
  },
  timeoutMs: number
): Promise<{ hash: string; explorerUrl?: string }>;
async function waitForTrackedTransaction(
  tx: {
    wait: () => Promise<void>;
    hash: string;
    explorerUrl?: string;
  },
  timeoutMs: number = TX_WAIT_TIMEOUT_MS
): Promise<{ hash: string; explorerUrl?: string }> {
  const normalizedHash = normalizeTransactionHash(tx.hash);
  const explorerUrl = sanitizeExplorerUrl(tx.explorerUrl);
  activeTransactionHashes.add(normalizedHash);
  timedOutTransactionHashes.delete(normalizedHash);
  try {
    await waitWithTimeout(
      { wait: () => tx.wait(), hash: normalizedHash },
      timeoutMs
    );
  } catch (error) {
    if (error instanceof TransactionWaitTimeoutError) {
      timedOutTransactionHashes.add(normalizedHash);
      const explorerHint = explorerUrl
        ? ` Check status in explorer: ${explorerUrl}.`
        : "";
      throw new Error(
        `Transaction ${normalizedHash} was submitted but not confirmed within ${error.timeoutMs}ms.${explorerHint} Avoid blind retries to prevent duplicate intents.`
      );
    }
    throw error;
  } finally {
    activeTransactionHashes.delete(normalizedHash);
  }
  timedOutTransactionHashes.delete(normalizedHash);
  return { hash: normalizedHash, explorerUrl };
}

async function resolveReferenceStakingClassHash(
  wallet: Wallet
): Promise<string | undefined> {
  if (!env.STARKNET_STAKING_CONTRACT) {
    return undefined;
  }
  if (!stakingReferenceClassHashPromise) {
    const stakingContract = fromAddress(env.STARKNET_STAKING_CONTRACT);
    stakingReferenceClassHashPromise = withTimeout(
      `Staking class-hash lookup for ${stakingContract}`,
      () => wallet.getProvider().getClassHashAt(stakingContract)
    )
      .then((hash) => fromAddress(hash))
      .catch((error) => {
        stakingReferenceClassHashPromise = undefined;
        throw new Error(
          `Could not validate configured staking contract class hash. ${summarizeError(error)}`
        );
      });
  }
  return stakingReferenceClassHashPromise;
}

function getCachedPoolClassHash(poolAddress: Address): string | undefined {
  if (poolClassHashCacheTtlMs <= 0) {
    return undefined;
  }
  const cached = poolClassHashCache.get(poolAddress);
  if (!cached) {
    return undefined;
  }
  if (cached.expiresAtMs <= nowMs()) {
    poolClassHashCache.delete(poolAddress);
    return undefined;
  }
  return cached.hash;
}

async function getPoolClassHashWithCache(
  wallet: Wallet,
  poolAddress: Address
): Promise<string> {
  const cached = getCachedPoolClassHash(poolAddress);
  if (cached) {
    return cached;
  }

  const inFlight = poolClassHashInFlight.get(poolAddress);
  if (inFlight) {
    return inFlight;
  }

  const request = withTimeout(
    `Pool contract existence check for ${poolAddress}`,
    () => wallet.getProvider().getClassHashAt(poolAddress)
  )
    .then((hash) => {
      const normalized = fromAddress(hash);
      if (poolClassHashCacheTtlMs > 0) {
        poolClassHashCache.set(poolAddress, {
          hash: normalized,
          expiresAtMs: nowMs() + poolClassHashCacheTtlMs,
        });
      }
      return normalized;
    })
    .finally(() => {
      poolClassHashInFlight.delete(poolAddress);
    });
  poolClassHashInFlight.set(poolAddress, request);
  return request;
}

async function assertPoolClassHashAllowed(
  wallet: Wallet,
  poolAddress: Address,
  poolClassHash: string
): Promise<void> {
  const expected = new Set(configuredPoolClassHashes);
  if (expected.size === 0) {
    const referenceClassHash = await resolveReferenceStakingClassHash(wallet);
    if (referenceClassHash) {
      expected.add(referenceClassHash);
    }
  }
  if (expected.size === 0) {
    return;
  }
  if (!expected.has(poolClassHash)) {
    throw new Error(
      `Invalid pool class hash ${poolClassHash} for ${poolAddress}. Pool type is not in the configured allowlist.`
    );
  }
}

async function waitWithTimeout(
  tx: { wait: () => Promise<void>; hash: string },
  timeoutMs: number = TX_WAIT_TIMEOUT_MS
): Promise<void> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TransactionWaitTimeoutError(tx.hash, timeoutMs));
    }, timeoutMs);
  });

  try {
    await Promise.race([tx.wait(), timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function resolvePoolTokenForOperation(
  wallet: Wallet,
  poolAddress: Address,
  tokenHint?: string
): Promise<Token> {
  let poolClassHash: string;
  try {
    poolClassHash = await getPoolClassHashWithCache(wallet, poolAddress);
  } catch (error) {
    if (isClassHashNotFoundError(error)) {
      throw new Error(
        `Invalid pool address: ${poolAddress} is not a deployed contract.`
      );
    }
    throw error;
  }
  await assertPoolClassHashAllowed(wallet, poolAddress, poolClassHash);

  let staking: unknown;
  try {
    staking = await withTimeout(`Pool metadata lookup for ${poolAddress}`, () =>
      wallet.staking(poolAddress)
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not resolve staking pool metadata for ${poolAddress}. ${reason}`
    );
  }
  assertStakingPoolShape(staking, poolAddress);
  const poolToken = extractPoolToken(staking);
  if (!poolToken) {
    throw new Error(
      "Could not resolve pool token metadata from SDK staking instance. Update the StarkZap SDK."
    );
  }
  assertPoolTokenHintMatches(poolToken, tokenHint, resolveToken);
  return poolToken;
}

type BoundedPoolField = "rewards" | "unpooling";
const requestTimestamps: number[] = [];
const readRequestTimestamps: number[] = [];
const writeRequestTimestamps: number[] = [];
let requestExecutionQueue: Promise<void> = Promise.resolve();
let rateLimitQueue: Promise<void> = Promise.resolve();

async function runRateLimitChecks(name: string): Promise<void> {
  const previous = rateLimitQueue;
  let release = () => {};
  rateLimitQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    enforcePerMinuteRateLimit(requestTimestamps, nowMs(), rateLimitRpm);
    if (READ_ONLY_TOOLS.has(name)) {
      enforcePerMinuteRateLimit(
        readRequestTimestamps,
        nowMs(),
        readRateLimitRpm
      );
    } else {
      enforcePerMinuteRateLimit(
        writeRequestTimestamps,
        nowMs(),
        writeRateLimitRpm
      );
    }
  } finally {
    release();
  }
}

async function runSerialized<T>(task: () => Promise<T>): Promise<T> {
  const previous = requestExecutionQueue;
  let release = () => {};
  requestExecutionQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await task();
  } finally {
    release();
  }
}

async function runWithToolConcurrencyPolicy<T>(
  toolName: string,
  task: () => Promise<T>
): Promise<T> {
  if (READ_ONLY_TOOLS.has(toolName)) {
    return task();
  }
  return runSerialized(task);
}

async function assertStablePoolAmountWithinCap(
  wallet: Wallet,
  poolAddress: Address,
  poolToken: Token,
  field: BoundedPoolField,
  maxCap: string,
  operation: "claim rewards" | "exit pool"
): Promise<void> {
  // Best-effort TOCTOU mitigation: repeated reads reduce stale-state risk before
  // submission, but an on-chain race window still exists until transaction inclusion.
  const firstPosition = await withTimeout(
    `Pool position preflight (${operation})`,
    () => wallet.getPoolPosition(poolAddress)
  );
  if (!firstPosition) {
    throw new Error(
      `Cannot ${operation}: wallet is not a member of pool ${poolAddress}.`
    );
  }
  assertPoolPositionShape(firstPosition, poolAddress);
  assertAmountWithinCap(firstPosition[field], poolToken, maxCap);

  const secondPosition = await withTimeout(
    `Pool position recheck (${operation})`,
    () => wallet.getPoolPosition(poolAddress)
  );
  if (!secondPosition) {
    throw new Error(
      `Cannot ${operation}: wallet is not a member of pool ${poolAddress}.`
    );
  }
  assertPoolPositionShape(secondPosition, poolAddress);
  if (!secondPosition[field].eq(firstPosition[field])) {
    throw new Error(
      `Cannot ${operation}: pool position changed during preflight checks. Retry.`
    );
  }
  assertAmountWithinCap(secondPosition[field], poolToken, maxCap);

  const thirdPosition = await withTimeout(
    `Pool position final check (${operation})`,
    () => wallet.getPoolPosition(poolAddress)
  );
  if (!thirdPosition) {
    throw new Error(
      `Cannot ${operation}: wallet is not a member of pool ${poolAddress}.`
    );
  }
  assertPoolPositionShape(thirdPosition, poolAddress);
  if (!thirdPosition[field].eq(secondPosition[field])) {
    throw new Error(
      `Cannot ${operation}: pool position changed right before submission. Retry.`
    );
  }
  assertAmountWithinCap(thirdPosition[field], poolToken, maxCap);
}

async function assertStableExitAmountWithinCap(
  wallet: Wallet,
  poolAddress: Address,
  poolToken: Token,
  maxCap: string
): Promise<void> {
  const readPosition = async (stage: string) => {
    const position = await withTimeout(stage, () =>
      wallet.getPoolPosition(poolAddress)
    );
    if (!position) {
      throw new Error(
        `Cannot exit pool: wallet is not a member of pool ${poolAddress}.`
      );
    }
    assertPoolPositionShape(position, poolAddress);
    if (position.unpooling.isZero()) {
      throw new Error(
        `Cannot exit pool: no pending unpool amount for pool ${poolAddress}.`
      );
    }
    return position;
  };

  const first = await readPosition("Pool position preflight (exit pool)");
  const firstTotal = first.unpooling.add(first.rewards);
  assertAmountWithinCap(firstTotal, poolToken, maxCap);

  const second = await readPosition("Pool position recheck (exit pool)");
  if (
    !second.unpooling.eq(first.unpooling) ||
    !second.rewards.eq(first.rewards)
  ) {
    throw new Error(
      "Cannot exit pool: pool position changed during preflight checks. Retry."
    );
  }
  const secondTotal = second.unpooling.add(second.rewards);
  assertAmountWithinCap(secondTotal, poolToken, maxCap);

  const third = await readPosition("Pool position final check (exit pool)");
  if (
    !third.unpooling.eq(second.unpooling) ||
    !third.rewards.eq(second.rewards)
  ) {
    throw new Error(
      "Cannot exit pool: pool position changed right before submission. Retry."
    );
  }
  const thirdTotal = third.unpooling.add(third.rewards);
  assertAmountWithinCap(thirdTotal, poolToken, maxCap);
}

function isRpcLikeError(error: unknown): boolean {
  const rpcErrorCodes = new Set([
    "contract_not_found",
    "starknet_error_contract_not_found",
    "etimedout",
    "econnreset",
    "econnrefused",
    "enotfound",
    "eai_again",
    "network_error",
    "rpc_error",
    "request_timeout",
    "gateway_timeout",
    "-32000",
    "-32005",
  ]);
  const rpcErrorNames = new Set([
    "aborterror",
    "fetcherror",
    "networkerror",
    "timeouterror",
  ]);
  const statusBasedRpcErrors = new Set([408, 429, 500, 502, 503, 504]);

  const possibleCodes: string[] = [];
  const possibleNames: string[] = [];
  const possibleStatuses: number[] = [];
  const queue: unknown[] = [error];
  const seen = new Set<unknown>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) {
      continue;
    }
    seen.add(current);
    if (current instanceof Error) {
      possibleNames.push(current.name.toLowerCase());
    }
    if (!isRecord(current)) {
      continue;
    }

    if (typeof current.code === "string" || typeof current.code === "number") {
      possibleCodes.push(String(current.code).toLowerCase());
    }
    if (
      typeof current.status === "number" &&
      Number.isInteger(current.status) &&
      current.status > 0
    ) {
      possibleStatuses.push(current.status);
    }
    if (
      typeof current.statusCode === "number" &&
      Number.isInteger(current.statusCode) &&
      current.statusCode > 0
    ) {
      possibleStatuses.push(current.statusCode);
    }
    if (typeof current.name === "string") {
      possibleNames.push(current.name.toLowerCase());
    }

    if (isRecord(current.data)) {
      queue.push(current.data);
    }
    if (current.cause !== undefined) {
      queue.push(current.cause);
    }
  }

  if (possibleCodes.some((code) => rpcErrorCodes.has(code))) {
    return true;
  }
  if (possibleNames.some((name) => rpcErrorNames.has(name))) {
    return true;
  }
  if (possibleStatuses.some((status) => statusBasedRpcErrors.has(status))) {
    return true;
  }

  const normalized = summarizeError(error).toLowerCase();
  if (normalized.includes("confirmation timed out")) {
    return false;
  }
  const markers = [
    "timed out",
    "timeout",
    "gateway timeout",
    "connection refused",
    "connection reset",
    "network",
    "econn",
    "transport",
    "rpc",
    "failed to fetch",
    "socket",
  ];
  return markers.some((marker) => normalized.includes(marker));
}

async function cleanupWalletAndSdkResources(): Promise<void> {
  if (cleanupPromise) {
    return cleanupPromise;
  }

  cleanupPromise = (async () => {
    walletInitPromise = undefined;
    const wallet = walletSingleton;
    if (wallet) {
      try {
        await withTimeout(
          "Wallet disconnect",
          () => wallet.disconnect(),
          WALLET_DISCONNECT_TIMEOUT_MS
        );
      } catch (error) {
        console.error(
          `[starkzap-mcp] wallet cleanup error: ${summarizeError(error)}`
        );
      }
    }

    const sdk = sdkSingleton as unknown as Record<string, unknown> | undefined;
    if (sdk) {
      for (const methodName of ["dispose", "close", "disconnect"] as const) {
        const cleanup = sdk[methodName];
        if (typeof cleanup !== "function") {
          continue;
        }
        try {
          await withTimeout(
            `SDK ${methodName}`,
            async () => {
              await Promise.resolve((cleanup as () => unknown).call(sdk));
            },
            WALLET_DISCONNECT_TIMEOUT_MS
          );
        } catch (error) {
          console.error(
            `[starkzap-mcp] sdk cleanup error (${methodName}): ${summarizeError(error)}`
          );
        }
        break;
      }
    }

    walletSingleton = undefined;
    sdkSingleton = undefined;
    sdkInitFailureCount = 0;
    sdkInitBackoffUntilMs = 0;
  })();

  try {
    await cleanupPromise;
  } finally {
    cleanupPromise = undefined;
  }
}

async function maybeResetWalletOnRpcError(error: unknown): Promise<void> {
  if (!isRpcLikeError(error)) {
    return;
  }
  await cleanupWalletAndSdkResources();
}

function buildToolErrorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const requestId = createErrorReference(message);
  console.error(`[starkzap-mcp:error][${requestId}] ${summarizeError(error)}`);
  const safeMessagePrefixes = [
    "Invalid ",
    "Unknown ",
    "Amount ",
    "Token ",
    "Cannot ",
    "Total ",
    "Could ",
    "Rate ",
    "Transaction ",
    "Address ",
    "starkzap_",
  ];
  const safeMessage = safeMessagePrefixes.some((prefix) =>
    message.startsWith(prefix)
  )
    ? message
    : `Operation failed. Reference: ${requestId}`;
  return `Error: ${safeMessage}`;
}

async function handleTool(
  name: string,
  rawArgs: Record<string, unknown>
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const schema = schemas[name as keyof typeof schemas];
  if (!schema) {
    throw new Error(`Unknown tool: ${name}`);
  }

  await runRateLimitChecks(name);
  const args = schema.parse(rawArgs);

  if (!READ_ONLY_TOOLS.has(name)) {
    if (name === "starkzap_execute" && !enableExecute) {
      throw new Error(
        "starkzap_execute is disabled. Start the server with --enable-execute to allow raw contract calls. " +
          "WARNING: this gives the agent unrestricted access to execute any contract call."
      );
    }
    if (name !== "starkzap_execute" && !enableWrite) {
      throw new Error(
        `${name} is a state-changing tool and is disabled by default. ` +
          "Start the server with --enable-write to allow write operations."
      );
    }
  }

  if (STAKING_TOOLS.has(name) && !stakingEnabled) {
    throw new Error(
      `${name} is disabled because STARKNET_STAKING_CONTRACT is not configured.`
    );
  }

  const wallet = await getWallet();
  const ok = (data: unknown) => ({
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  });

  switch (name) {
    case "starkzap_get_account": {
      const provider = wallet.getProvider();
      const expectedClassHash = fromAddress(wallet.getClassHash());
      let deployed = false;
      let deployedClassHash: string | undefined;
      try {
        deployedClassHash = fromAddress(
          await withTimeout("Account deployment check", () =>
            provider.getClassHashAt(wallet.address)
          )
        );
        deployed = true;
      } catch (error) {
        if (!isClassHashNotFoundError(error)) {
          throw error;
        }
      }

      return ok({
        address: wallet.address,
        deployed,
        expectedClassHash,
        deployedClassHash: deployedClassHash ?? null,
      });
    }

    case "starkzap_get_balance": {
      const parsed = args as z.infer<typeof schemas.starkzap_get_balance>;
      const token = resolveToken(parsed.token);
      const balance = await withTimeout("Token balance query", () =>
        wallet.balanceOf(token)
      );
      assertAmountMethods(balance, "balance", [
        "toUnit",
        "toFormatted",
        "toBase",
        "getDecimals",
      ]);
      return ok({
        token: token.symbol,
        address: token.address,
        balance: balance.toUnit(),
        formatted: balance.toFormatted(),
        raw: balance.toBase().toString(),
        decimals: balance.getDecimals(),
      });
    }

    case "starkzap_transfer": {
      const parsed = args as z.infer<typeof schemas.starkzap_transfer>;
      const token = resolveToken(parsed.token);
      const recipients = validateAddressBatch(
        parsed.transfers.map((transfer) => transfer.to),
        "recipient",
        "transfers.to"
      );
      const transfers = parsed.transfers.map((transfer, index) => {
        const amount = parseAmountWithContext(
          transfer.amount,
          token,
          `transfer[${index}]`
        );
        assertAmountWithinCap(amount, token, maxAmount);
        return {
          to: recipients[index],
          amount,
        };
      });

      assertBatchAmountWithinCap(
        transfers.map((transfer) => transfer.amount),
        token,
        maxBatchAmount
      );

      const feeMode: "sponsored" | undefined = parsed.sponsored
        ? "sponsored"
        : undefined;
      const tx = await withTimeout("Token transfer submission", () =>
        wallet.transfer(token, transfers, {
          ...(feeMode && { feeMode }),
        })
      );
      const txResult = await waitForTrackedTransaction(tx);
      if (feeMode === "sponsored") {
        await assertWalletAccountClassHash(
          wallet,
          "Sponsored transfer post-check"
        );
      }
      return ok({
        hash: txResult.hash,
        explorerUrl: txResult.explorerUrl,
        transfers: transfers.map((transfer) => ({
          to: transfer.to,
          amount: transfer.amount.toUnit(),
          symbol: token.symbol,
        })),
      });
    }

    case "starkzap_execute": {
      const parsed = args as z.infer<typeof schemas.starkzap_execute>;
      const contractAddresses = validateAddressBatch(
        parsed.calls.map((call) => call.contractAddress),
        "contract",
        "calls.contractAddress"
      );
      const calls = parsed.calls.map((call, index) => ({
        contractAddress: contractAddresses[index],
        entrypoint: call.entrypoint,
        calldata: call.calldata ?? [],
      }));
      const feeMode: "sponsored" | undefined = parsed.sponsored
        ? "sponsored"
        : undefined;
      const tx = await withTimeout("Contract execution submission", () =>
        wallet.execute(calls, {
          ...(feeMode && { feeMode }),
        })
      );
      const txResult = await waitForTrackedTransaction(tx);
      if (feeMode === "sponsored") {
        await assertWalletAccountClassHash(
          wallet,
          "Sponsored execute post-check"
        );
      }
      return ok({
        hash: txResult.hash,
        explorerUrl: txResult.explorerUrl,
        callCount: calls.length,
      });
    }

    case "starkzap_deploy_account": {
      const parsed = args as z.infer<typeof schemas.starkzap_deploy_account>;
      const provider = wallet.getProvider();
      let isDeployedOnChain = false;
      let deployedClassHash: string | undefined;
      try {
        const classHash = await withTimeout("Account deployment check", () =>
          provider.getClassHashAt(wallet.address)
        );
        deployedClassHash = fromAddress(classHash);
        isDeployedOnChain = true;
      } catch (error) {
        if (!isClassHashNotFoundError(error)) {
          throw error;
        }
      }
      if (isDeployedOnChain) {
        const expectedClassHash = fromAddress(wallet.getClassHash());
        if (deployedClassHash !== expectedClassHash) {
          throw new Error(
            `Address ${wallet.address} is deployed with unexpected class hash ${deployedClassHash}. Expected ${expectedClassHash}. Use the private key that controls this deployed account, or use a different private key and deploy it first with starkzap_deploy_account.`
          );
        }
        return ok({
          status: "already_deployed",
          address: wallet.address,
        });
      }
      const feeMode: "sponsored" | undefined = parsed.sponsored
        ? "sponsored"
        : undefined;
      const tx = await withTimeout("Account deployment submission", () =>
        wallet.deploy({
          ...(feeMode && { feeMode }),
        })
      );
      const txResult = await waitForTrackedTransaction(tx);
      await assertWalletAccountClassHash(wallet, "Deploy account post-check");
      return ok({
        status: "deployed",
        hash: txResult.hash,
        explorerUrl: txResult.explorerUrl,
        address: wallet.address,
      });
    }

    case "starkzap_enter_pool": {
      const parsed = args as z.infer<typeof schemas.starkzap_enter_pool>;
      const poolAddress = validateAddressOrThrow(parsed.pool, "pool");
      const poolToken = await resolvePoolTokenForOperation(
        wallet,
        poolAddress,
        parsed.token
      );
      const amount = parseAmountWithContext(
        parsed.amount,
        poolToken,
        "enter_pool"
      );
      assertAmountWithinCap(amount, poolToken, maxAmount);
      const tx = await withTimeout("Enter pool submission", () =>
        wallet.enterPool(poolAddress, amount)
      );
      const txResult = await waitForTrackedTransaction(tx);
      return ok({
        hash: txResult.hash,
        explorerUrl: txResult.explorerUrl,
        pool: poolAddress,
        amount: amount.toUnit(),
        symbol: poolToken.symbol,
      });
    }

    case "starkzap_add_to_pool": {
      const parsed = args as z.infer<typeof schemas.starkzap_add_to_pool>;
      const poolAddress = validateAddressOrThrow(parsed.pool, "pool");
      const poolToken = await resolvePoolTokenForOperation(
        wallet,
        poolAddress,
        parsed.token
      );
      const amount = parseAmountWithContext(
        parsed.amount,
        poolToken,
        "add_to_pool"
      );
      assertAmountWithinCap(amount, poolToken, maxAmount);
      const tx = await withTimeout("Add to pool submission", () =>
        wallet.addToPool(poolAddress, amount)
      );
      const txResult = await waitForTrackedTransaction(tx);
      return ok({
        hash: txResult.hash,
        explorerUrl: txResult.explorerUrl,
        pool: poolAddress,
        amount: amount.toUnit(),
        symbol: poolToken.symbol,
      });
    }

    case "starkzap_claim_rewards": {
      const parsed = args as z.infer<typeof schemas.starkzap_claim_rewards>;
      const poolAddress = validateAddressOrThrow(parsed.pool, "pool");
      const poolToken = await resolvePoolTokenForOperation(wallet, poolAddress);
      await assertStablePoolAmountWithinCap(
        wallet,
        poolAddress,
        poolToken,
        "rewards",
        maxAmount,
        "claim rewards"
      );
      const tx = await withTimeout("Claim pool rewards submission", () =>
        wallet.claimPoolRewards(poolAddress)
      );
      const txResult = await waitForTrackedTransaction(tx);
      return ok({
        hash: txResult.hash,
        explorerUrl: txResult.explorerUrl,
        pool: poolAddress,
      });
    }

    case "starkzap_exit_pool_intent": {
      const parsed = args as z.infer<typeof schemas.starkzap_exit_pool_intent>;
      const poolAddress = validateAddressOrThrow(parsed.pool, "pool");
      const poolToken = await resolvePoolTokenForOperation(
        wallet,
        poolAddress,
        parsed.token
      );
      const amount = parseAmountWithContext(
        parsed.amount,
        poolToken,
        "exit_pool_intent"
      );
      assertAmountWithinCap(amount, poolToken, maxAmount);
      const tx = await withTimeout("Exit pool intent submission", () =>
        wallet.exitPoolIntent(poolAddress, amount)
      );
      const txResult = await waitForTrackedTransaction(tx);
      return ok({
        hash: txResult.hash,
        explorerUrl: txResult.explorerUrl,
        pool: poolAddress,
        amount: amount.toUnit(),
        symbol: poolToken.symbol,
        note: "Tokens stop earning rewards now. Call starkzap_exit_pool after the waiting period.",
      });
    }

    case "starkzap_exit_pool": {
      const parsed = args as z.infer<typeof schemas.starkzap_exit_pool>;
      const poolAddress = validateAddressOrThrow(parsed.pool, "pool");
      const poolToken = await resolvePoolTokenForOperation(wallet, poolAddress);
      await assertStableExitAmountWithinCap(
        wallet,
        poolAddress,
        poolToken,
        maxAmount
      );
      const tx = await withTimeout("Exit pool submission", () =>
        wallet.exitPool(poolAddress)
      );
      const txResult = await waitForTrackedTransaction(tx);
      return ok({
        hash: txResult.hash,
        explorerUrl: txResult.explorerUrl,
        pool: poolAddress,
      });
    }

    case "starkzap_get_pool_position": {
      const parsed = args as z.infer<typeof schemas.starkzap_get_pool_position>;
      const poolAddress = validateAddressOrThrow(parsed.pool, "pool");
      const position = await withTimeout("Pool position query", () =>
        wallet.getPoolPosition(poolAddress)
      );
      if (!position) {
        return ok({
          pool: poolAddress,
          isMember: false,
        });
      }
      assertPoolPositionShape(position, poolAddress);
      const unpoolTime = position.unpoolTime ?? null;
      const queriedAtEpochMs = nowMs();
      return ok({
        pool: poolAddress,
        isMember: true,
        staked: position.staked.toUnit(),
        stakedFormatted: position.staked.toFormatted(),
        rewards: position.rewards.toUnit(),
        rewardsFormatted: position.rewards.toFormatted(),
        total: position.total.toUnit(),
        totalFormatted: position.total.toFormatted(),
        commissionPercent: position.commissionPercent,
        unpooling: position.unpooling.toUnit(),
        unpoolTime: unpoolTime?.toISOString() ?? null,
        unpoolTimeEpochMs: unpoolTime?.getTime() ?? null,
        queriedAtEpochMs,
        secondsUntilUnpool:
          unpoolTime === null
            ? null
            : Math.max(
                0,
                Math.ceil((unpoolTime.getTime() - queriedAtEpochMs) / 1000)
              ),
      });
    }

    case "starkzap_estimate_fee": {
      const parsed = args as z.infer<typeof schemas.starkzap_estimate_fee>;
      const contractAddresses = validateAddressBatch(
        parsed.calls.map((call) => call.contractAddress),
        "contract",
        "calls.contractAddress"
      );
      const calls = parsed.calls.map((call, index) => ({
        contractAddress: contractAddresses[index],
        entrypoint: call.entrypoint,
        calldata: call.calldata ?? [],
      }));
      const fee = await withTimeout("Fee estimate query", () =>
        wallet.estimateFee(calls)
      );
      assertOverallFeeIsBigInt(fee);
      const { l1_gas, l2_gas, l1_data_gas } = requireResourceBounds(fee);
      const unit =
        typeof fee.unit === "string" && fee.unit.length > 0
          ? fee.unit
          : "unknown";
      return ok({
        overall_fee: fee.overall_fee.toString(),
        unit,
        resource_bounds: {
          l1_gas: {
            max_amount: l1_gas.max_amount.toString(),
            max_price_per_unit: l1_gas.max_price_per_unit.toString(),
          },
          l2_gas: {
            max_amount: l2_gas.max_amount.toString(),
            max_price_per_unit: l2_gas.max_price_per_unit.toString(),
          },
          l1_data_gas: {
            max_amount: l1_data_gas.max_amount.toString(),
            max_price_per_unit: l1_data_gas.max_price_per_unit.toString(),
          },
        },
      });
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// MCP server setup
// ---------------------------------------------------------------------------
const server = new Server(
  {
    name: "starkzap-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

async function handleCallToolRequest(request: {
  params: { name: string; arguments?: Record<string, unknown> | undefined };
}): Promise<{
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}> {
  const { name, arguments: toolArgs } = request.params;
  return await runWithToolConcurrencyPolicy(name, async () => {
    try {
      return await handleTool(
        name,
        (toolArgs ?? {}) as Record<string, unknown>
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Validation error: ${formatZodError(error)}`,
            },
          ],
          isError: true,
        };
      }
      await maybeResetWalletOnRpcError(error);
      return {
        content: [{ type: "text" as const, text: buildToolErrorText(error) }],
        isError: true,
      };
    }
  });
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  return handleCallToolRequest(
    request as {
      params: { name: string; arguments?: Record<string, unknown> | undefined };
    }
  );
});

interface TestingHooks {
  withTimeout<T>(
    operation: string,
    promiseFactory: () => Promise<T>,
    timeoutMs?: number
  ): Promise<T>;
  waitWithTimeout(
    tx: { wait: () => Promise<void>; hash: string },
    timeoutMs?: number
  ): Promise<void>;
  waitForTrackedTransaction(
    tx: { wait: () => Promise<void>; hash: string; explorerUrl?: string },
    timeoutMs?: number
  ): Promise<{ hash: string; explorerUrl?: string }>;
  getWallet(): Promise<Wallet>;
  runSerialized<T>(task: () => Promise<T>): Promise<T>;
  runWithToolConcurrencyPolicy<T>(
    toolName: string,
    task: () => Promise<T>
  ): Promise<T>;
  handleCallToolRequest(request: {
    params: { name: string; arguments?: Record<string, unknown> | undefined };
  }): Promise<{
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  }>;
  assertStablePoolAmountWithinCap(
    wallet: Wallet,
    poolAddress: Address,
    poolToken: Token,
    field: BoundedPoolField,
    maxCap: string,
    operation: "claim rewards" | "exit pool"
  ): Promise<void>;
  assertStableExitAmountWithinCap(
    wallet: Wallet,
    poolAddress: Address,
    poolToken: Token,
    maxCap: string
  ): Promise<void>;
  buildToolErrorText(error: unknown): string;
  isRpcLikeError(error: unknown): boolean;
  maybeResetWalletOnRpcError(error: unknown): Promise<void>;
  cleanupWalletAndSdkResources(): Promise<void>;
  trackedTransactions(): { active: string[]; timedOut: string[] };
  setNowProvider(provider: () => number): void;
  setSdkSingleton(value: StarkSDK | undefined): void;
  setWalletSingleton(value: Wallet | undefined): void;
  resetState(): void;
}

const testingHooks: TestingHooks = {
  withTimeout,
  waitWithTimeout,
  waitForTrackedTransaction,
  getWallet,
  runSerialized,
  runWithToolConcurrencyPolicy,
  handleCallToolRequest,
  assertStablePoolAmountWithinCap,
  assertStableExitAmountWithinCap,
  buildToolErrorText,
  isRpcLikeError,
  maybeResetWalletOnRpcError,
  cleanupWalletAndSdkResources,
  trackedTransactions() {
    return {
      active: Array.from(activeTransactionHashes),
      timedOut: Array.from(timedOutTransactionHashes),
    };
  },
  setNowProvider(provider: () => number) {
    nowProvider = provider;
  },
  setSdkSingleton(value: StarkSDK | undefined) {
    sdkSingleton = value;
  },
  setWalletSingleton(value: Wallet | undefined) {
    walletSingleton = value;
  },
  resetState() {
    sdkSingleton = undefined;
    walletSingleton = undefined;
    walletInitPromise = undefined;
    walletInitFailureCount = 0;
    walletInitBackoffUntilMs = 0;
    sdkInitFailureCount = 0;
    sdkInitBackoffUntilMs = 0;
    cleanupPromise = undefined;
    requestExecutionQueue = Promise.resolve();
    rateLimitQueue = Promise.resolve();
    requestTimestamps.splice(0, requestTimestamps.length);
    readRequestTimestamps.splice(0, readRequestTimestamps.length);
    writeRequestTimestamps.splice(0, writeRequestTimestamps.length);
    activeTransactionHashes.clear();
    timedOutTransactionHashes.clear();
    poolClassHashCache.clear();
    poolClassHashInFlight.clear();
    stakingReferenceClassHashPromise = undefined;
    nowProvider = () => Date.now();
  },
};

const testHooksEnabled =
  process.env.NODE_ENV === "test" &&
  process.env.STARKZAP_MCP_ENABLE_TEST_HOOKS === "1";
const allowUnsafeTestHooks =
  process.env.STARKZAP_MCP_ALLOW_UNSAFE_TEST_HOOKS === "1";
const unsafeTestHooksAcknowledged =
  process.env.STARKZAP_MCP_UNSAFE_TEST_HOOKS_ACK ===
  "I_UNDERSTAND_THIS_EXPOSES_WALLET_MUTATION";
const unsafeHooksAllowedOnMainnet =
  process.env.STARKZAP_MCP_ALLOW_UNSAFE_TEST_HOOKS_MAINNET === "1";
const testHookPrivateKeyIsSafe = (() => {
  try {
    return BigInt(env.STARKNET_PRIVATE_KEY) <= 1024n;
  } catch {
    return false;
  }
})();
if (process.env.NODE_ENV === "test" && !testHooksEnabled) {
  console.error(
    "[starkzap-mcp] NODE_ENV=test detected, but test hooks are disabled. Set STARKZAP_MCP_ENABLE_TEST_HOOKS=1 to enable hooks."
  );
}
if (testHooksEnabled) {
  const unsafeBypassEnabled =
    allowUnsafeTestHooks && unsafeTestHooksAcknowledged;
  const rpcUrlLooksLikeMainnet =
    typeof env.STARKNET_RPC_URL === "string" &&
    /mainnet/i.test(env.STARKNET_RPC_URL) &&
    !/(localhost|127\.0\.0\.1|\[::1\])/i.test(env.STARKNET_RPC_URL);
  const hasProductionLikeIndicators =
    network === "mainnet" || rpcUrlLooksLikeMainnet;
  const blocksUnsafeBypassForEnvironment =
    unsafeBypassEnabled &&
    hasProductionLikeIndicators &&
    !unsafeHooksAllowedOnMainnet;
  if (!testHookPrivateKeyIsSafe && !unsafeBypassEnabled) {
    console.error(
      "[starkzap-mcp] refusing to expose test hooks: STARKNET_PRIVATE_KEY does not look like a test key. To bypass in controlled environments only, set STARKZAP_MCP_ALLOW_UNSAFE_TEST_HOOKS=1 and STARKZAP_MCP_UNSAFE_TEST_HOOKS_ACK=I_UNDERSTAND_THIS_EXPOSES_WALLET_MUTATION."
    );
  } else if (blocksUnsafeBypassForEnvironment) {
    console.error(
      "[starkzap-mcp] refusing unsafe test hooks in production-like environments. Use a safe test key instead, or set STARKZAP_MCP_ALLOW_UNSAFE_TEST_HOOKS_MAINNET=1 only in isolated local test environments."
    );
  } else {
    (globalThis as Record<string, unknown>).__STARKZAP_MCP_TESTING__ =
      testingHooks;
  }
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
function getSdkPackageVersion(): string {
  // Prefer runtime-resolved package metadata to avoid stale lockfile assumptions.
  try {
    const sdkEntryPath = require.resolve("starkzap");
    let cursor = path.dirname(sdkEntryPath);
    for (let i = 0; i < 8; i += 1) {
      const packageJsonPath = path.join(cursor, "package.json");
      if (existsSync(packageJsonPath)) {
        const sdkPackageJson = JSON.parse(
          readFileSync(packageJsonPath, "utf8")
        ) as {
          name?: string;
          version?: string;
        };
        if (
          sdkPackageJson.name === "starkzap" &&
          typeof sdkPackageJson.version === "string" &&
          sdkPackageJson.version
        ) {
          return sdkPackageJson.version;
        }
      }
      const parent = path.dirname(cursor);
      if (parent === cursor) {
        break;
      }
      cursor = parent;
    }
  } catch {
    // Ignore and fall back to declared dependency version below.
  }

  // Fallback to the dependency declared by this package.
  try {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const packageJsonPath = path.resolve(currentDir, "../package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, string>;
    };
    const declaredVersion = packageJson.dependencies?.starkzap;
    if (typeof declaredVersion === "string" && declaredVersion.trim() !== "") {
      return declaredVersion;
    }
  } catch {
    // Keep unknown if package metadata cannot be read.
  }

  return "unknown";
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const commit =
    process.env.GIT_COMMIT_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.COMMIT_SHA ??
    "unknown";
  const packageVersion = (() => {
    const fallback = process.env.npm_package_version;
    try {
      const currentDir = path.dirname(fileURLToPath(import.meta.url));
      const packageJson = JSON.parse(
        readFileSync(path.resolve(currentDir, "../package.json"), "utf8")
      ) as { version?: string };
      if (packageJson.version) {
        return packageJson.version;
      }
    } catch (error) {
      console.error(
        `[starkzap-mcp] package version lookup failed: ${summarizeError(error)}`
      );
    }
    if (fallback) {
      console.error(
        "[starkzap-mcp] package version unavailable in package.json; using npm_package_version fallback"
      );
      return fallback;
    }
    const shortCommit = commit === "unknown" ? "unknown" : commit.slice(0, 12);
    console.error(
      `[starkzap-mcp] package version unavailable; using commit fallback (${shortCommit})`
    );
    return `unknown+${shortCommit}`;
  })();
  const sdkVersion = getSdkPackageVersion();
  console.error(
    `starkzap-mcp server running (version=${packageVersion}, sdk=${sdkVersion}, commit=${commit}, network: ${network}, transport: stdio, write=${enableWrite}, execute=${enableExecute}, staking=${stakingEnabled}, maxAmount=${maxAmount}, maxBatchAmount=${maxBatchAmount}, rateLimitRpm=${rateLimitRpm}, readRateLimitRpm=${readRateLimitRpm}, writeRateLimitRpm=${writeRateLimitRpm}, rpcTimeoutMs=${rpcTimeoutMs}, poolCacheTtlMs=${poolClassHashCacheTtlMs})`
  );
}

const isMainModule =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  const shutdown = async (signal: "SIGINT" | "SIGTERM") => {
    const pending = Array.from(activeTransactionHashes);
    const timedOut = Array.from(timedOutTransactionHashes);
    console.error(
      `[starkzap-mcp] ${signal} received. pendingTx=${pending.length === 0 ? "none" : pending.join(",")} timedOutTx=${timedOut.length === 0 ? "none" : timedOut.join(",")}`
    );
    const signalExitCode = signal === "SIGINT" ? 130 : 143;
    let exitCode = signalExitCode;
    try {
      await server.close();
      await cleanupWalletAndSdkResources();
    } catch (error) {
      console.error(`[starkzap-mcp] shutdown error: ${summarizeError(error)}`);
      exitCode = 1;
    } finally {
      process.exit(exitCode);
    }
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  main().catch((err) => {
    console.error(`Fatal: ${summarizeError(err)}`);
    process.exit(1);
  });
}
