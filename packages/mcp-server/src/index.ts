#!/usr/bin/env node

/**
 * x MCP Server
 *
 * Exposes Starknet wallet operations as MCP tools via the StarkZap SDK.
 * Works with any MCP-compatible client: Claude, Cursor, OpenAI Agents SDK, etc.
 *
 * Usage:
 *   STARKNET_PRIVATE_KEY=0x... npx @keep-starknet-strange/x-mcp --network mainnet
 */

import { fileURLToPath } from "node:url";
import path from "node:path";
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

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const cliArgs = process.argv.slice(2);

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
} = cliConfig;

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const privateKeySchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "Must be a 0x-prefixed 32-byte hex private key")
  .refine((value) => BigInt(value) !== 0n, "Private key cannot be zero");

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
  STARKNET_RPC_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .max(300_000)
    .optional(),
});

const env = (() => {
  const parsed = envSchema.safeParse(process.env);
  if (parsed.success) {
    const data = parsed.data;
    delete process.env.STARKNET_PRIVATE_KEY;
    return data;
  }
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
    .join("; ");
  console.error(`Error: invalid environment configuration: ${details}`);
  process.exit(1);
})();
// `env` is a flat object today; shallow freeze is enough unless nested fields are added.
Object.freeze(env);

const stakingEnabled = Boolean(env.STARKNET_STAKING_CONTRACT);
const rpcTimeoutMs = env.STARKNET_RPC_TIMEOUT_MS ?? 30_000;
let nowProvider = () => Date.now();

// ---------------------------------------------------------------------------
// SDK + wallet singleton (lazy init)
// ---------------------------------------------------------------------------
let sdkSingleton: StarkSDK | undefined;
let walletSingleton: Wallet | undefined;
let walletInitPromise: Promise<Wallet> | undefined;
let walletInitFailureCount = 0;
let walletInitBackoffUntilMs = 0;
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
  if (!sdkSingleton) {
    sdkSingleton = new StarkSDK(sdkConfig);
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
  const raw =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === "string"
        ? error
        : (JSON.stringify(error) ?? String(error));
  return raw.replace(/https?:\/\/\S+/gi, "<url>").slice(0, 1024);
}

function createErrorReference(message: string): string {
  return createHash("sha256").update(message).digest("hex").slice(0, 12);
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
          30_000,
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
const activeTransactionHashes = new Set<string>();

function normalizeTransactionHash(hash: string): string {
  if (!FELT_REGEX.test(hash)) {
    throw new Error(`Invalid transaction hash returned by SDK: "${hash}"`);
  }
  return fromAddress(hash);
}

async function waitForTrackedTransaction(tx: {
  wait: () => Promise<void>;
  hash: string;
  explorerUrl?: string;
}): Promise<{ hash: string; explorerUrl?: string }> {
  const normalizedHash = normalizeTransactionHash(tx.hash);
  activeTransactionHashes.add(normalizedHash);
  try {
    await waitWithTimeout({ wait: tx.wait, hash: normalizedHash });
  } finally {
    activeTransactionHashes.delete(normalizedHash);
  }
  return { hash: normalizedHash, explorerUrl: tx.explorerUrl };
}

async function waitWithTimeout(
  tx: { wait: () => Promise<void>; hash: string },
  timeoutMs: number = TX_WAIT_TIMEOUT_MS
): Promise<void> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new Error(
          `Transaction ${tx.hash} confirmation timed out after ${timeoutMs}ms`
        )
      );
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
  try {
    await withTimeout(`Pool contract existence check for ${poolAddress}`, () =>
      wallet.getProvider().getClassHashAt(poolAddress)
    );
  } catch (error) {
    if (isClassHashNotFoundError(error)) {
      throw new Error(
        `Invalid pool address: ${poolAddress} is not a deployed contract.`
      );
    }
    throw error;
  }

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
let requestExecutionQueue: Promise<void> = Promise.resolve();

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
  const firstPosition = await withTimeout(
    `Pool position preflight (${operation})`,
    () => wallet.getPoolPosition(poolAddress)
  );
  if (!firstPosition) {
    throw new Error(
      `Cannot ${operation}: wallet is not a member of pool ${poolAddress}.`
    );
  }
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
  if (!thirdPosition[field].eq(secondPosition[field])) {
    throw new Error(
      `Cannot ${operation}: pool position changed right before submission. Retry.`
    );
  }
  assertAmountWithinCap(thirdPosition[field], poolToken, maxCap);
}

function isRpcLikeError(error: unknown): boolean {
  const normalized = summarizeError(error).toLowerCase();
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
  walletInitPromise = undefined;
  if (walletSingleton) {
    try {
      await walletSingleton.disconnect();
    } catch (error) {
      console.error(`[x-mcp] wallet cleanup error: ${summarizeError(error)}`);
    }
  }
  walletSingleton = undefined;
  sdkSingleton = undefined;
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
  console.error(`[x-mcp:error][${requestId}] ${summarizeError(error)}`);
  const safeMessagePrefixes = [
    "Invalid ",
    "Unknown ",
    "Amount ",
    "Token ",
    "Cannot ",
    "Total ",
    "Could ",
    "Rate ",
    "Address ",
    "x_",
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
  enforcePerMinuteRateLimit(requestTimestamps, nowMs(), rateLimitRpm);

  const schema = schemas[name as keyof typeof schemas];
  if (!schema) {
    throw new Error(`Unknown tool: ${name}`);
  }
  const args = schema.parse(rawArgs);

  if (!READ_ONLY_TOOLS.has(name)) {
    if (name === "x_execute" && !enableExecute) {
      throw new Error(
        "x_execute is disabled. Start the server with --enable-execute to allow raw contract calls. " +
          "WARNING: this gives the agent unrestricted access to execute any contract call."
      );
    }
    if (name !== "x_execute" && !enableWrite) {
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
    case "x_get_balance": {
      const parsed = args as z.infer<typeof schemas.x_get_balance>;
      const token = resolveToken(parsed.token);
      const balance = await withTimeout("Token balance query", () =>
        wallet.balanceOf(token)
      );
      return ok({
        token: token.symbol,
        address: token.address,
        balance: balance.toUnit(),
        formatted: balance.toFormatted(),
        raw: balance.toBase().toString(),
        decimals: balance.getDecimals(),
      });
    }

    case "x_transfer": {
      const parsed = args as z.infer<typeof schemas.x_transfer>;
      const token = resolveToken(parsed.token);
      const recipients = validateAddressBatch(
        parsed.transfers.map((transfer) => transfer.to),
        "recipient",
        "transfers.to"
      );
      const transfers = parsed.transfers.map((transfer, index) => {
        const amount = Amount.parse(transfer.amount, token);
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

    case "x_execute": {
      const parsed = args as z.infer<typeof schemas.x_execute>;
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
      return ok({
        hash: txResult.hash,
        explorerUrl: txResult.explorerUrl,
        callCount: calls.length,
      });
    }

    case "x_deploy_account": {
      const parsed = args as z.infer<typeof schemas.x_deploy_account>;
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
            `Address ${wallet.address} is deployed with unexpected class hash ${deployedClassHash}. Expected ${expectedClassHash}.`
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
      return ok({
        status: "deployed",
        hash: txResult.hash,
        explorerUrl: txResult.explorerUrl,
        address: wallet.address,
      });
    }

    case "x_enter_pool": {
      const parsed = args as z.infer<typeof schemas.x_enter_pool>;
      const poolAddress = validateAddressOrThrow(parsed.pool, "pool");
      const poolToken = await resolvePoolTokenForOperation(
        wallet,
        poolAddress,
        parsed.token
      );
      const amount = Amount.parse(parsed.amount, poolToken);
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

    case "x_add_to_pool": {
      const parsed = args as z.infer<typeof schemas.x_add_to_pool>;
      const poolAddress = validateAddressOrThrow(parsed.pool, "pool");
      const poolToken = await resolvePoolTokenForOperation(
        wallet,
        poolAddress,
        parsed.token
      );
      const amount = Amount.parse(parsed.amount, poolToken);
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

    case "x_claim_rewards": {
      const parsed = args as z.infer<typeof schemas.x_claim_rewards>;
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

    case "x_exit_pool_intent": {
      const parsed = args as z.infer<typeof schemas.x_exit_pool_intent>;
      const poolAddress = validateAddressOrThrow(parsed.pool, "pool");
      const poolToken = await resolvePoolTokenForOperation(
        wallet,
        poolAddress,
        parsed.token
      );
      const amount = Amount.parse(parsed.amount, poolToken);
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
        note: "Tokens stop earning rewards now. Call x_exit_pool after the waiting period.",
      });
    }

    case "x_exit_pool": {
      const parsed = args as z.infer<typeof schemas.x_exit_pool>;
      const poolAddress = validateAddressOrThrow(parsed.pool, "pool");
      const poolToken = await resolvePoolTokenForOperation(wallet, poolAddress);
      const position = await withTimeout("Pool position fetch for exit", () =>
        wallet.getPoolPosition(poolAddress)
      );
      if (!position) {
        throw new Error(
          `Cannot exit pool: wallet is not a member of pool ${poolAddress}.`
        );
      }
      if (position.unpooling.isZero()) {
        throw new Error(
          `Cannot exit pool: no pending unpool amount for pool ${poolAddress}.`
        );
      }
      await assertStablePoolAmountWithinCap(
        wallet,
        poolAddress,
        poolToken,
        "unpooling",
        maxAmount,
        "exit pool"
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

    case "x_get_pool_position": {
      const parsed = args as z.infer<typeof schemas.x_get_pool_position>;
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
      const unpoolTime = position.unpoolTime ?? null;
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
        secondsUntilUnpool:
          unpoolTime === null
            ? null
            : Math.max(0, Math.ceil((unpoolTime.getTime() - nowMs()) / 1000)),
      });
    }

    case "x_estimate_fee": {
      const parsed = args as z.infer<typeof schemas.x_estimate_fee>;
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
      const { l1_gas, l2_gas, l1_data_gas } = requireResourceBounds(fee);
      return ok({
        overall_fee: fee.overall_fee.toString(),
        unit: fee.unit,
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
    name: "x-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: toolArgs } = request.params;
  return runWithToolConcurrencyPolicy(name, async () => {
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
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `x-mcp server running (network: ${network}, transport: stdio, write=${enableWrite}, execute=${enableExecute}, staking=${stakingEnabled}, maxAmount=${maxAmount}, maxBatchAmount=${maxBatchAmount}, rateLimitRpm=${rateLimitRpm}, rpcTimeoutMs=${rpcTimeoutMs})`
  );
}

const isMainModule =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  const shutdown = async (signal: "SIGINT" | "SIGTERM") => {
    const pending = Array.from(activeTransactionHashes);
    console.error(
      `[x-mcp] ${signal} received. pendingTx=${pending.length === 0 ? "none" : pending.join(",")}`
    );
    try {
      await server.close();
      await cleanupWalletAndSdkResources();
    } catch (error) {
      console.error(`[x-mcp] shutdown error: ${summarizeError(error)}`);
    } finally {
      process.exit(0);
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

export const __testing = {
  withTimeout,
  waitWithTimeout,
  getWallet,
  runSerialized,
  runWithToolConcurrencyPolicy,
  assertStablePoolAmountWithinCap,
  buildToolErrorText,
  isRpcLikeError,
  maybeResetWalletOnRpcError,
  cleanupWalletAndSdkResources,
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
    requestExecutionQueue = Promise.resolve();
    requestTimestamps.splice(0, requestTimestamps.length);
    activeTransactionHashes.clear();
    nowProvider = () => Date.now();
  },
};
