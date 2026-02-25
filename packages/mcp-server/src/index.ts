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
  extractPoolToken,
  FELT_REGEX,
  formatZodError,
  parseCliConfig,
  READ_ONLY_TOOLS,
  requireResourceBounds,
  schemas,
  selectTools,
  STAKING_TOOLS,
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

const { network, enableWrite, enableExecute, maxAmount, maxBatchAmount } =
  cliConfig;

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const privateKeySchema = z
  .string()
  .regex(
    /^0x[0-9a-fA-F]{64}$/,
    "Must be a 0x-prefixed 32-byte hex private key"
  );

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

const envSchema = z.object({
  STARKNET_PRIVATE_KEY: privateKeySchema,
  STARKNET_RPC_URL: z.string().url().optional(),
  STARKNET_STAKING_CONTRACT: contractAddressSchema.optional(),
});

const env = (() => {
  const parsed = envSchema.safeParse(process.env);
  if (parsed.success) {
    return parsed.data;
  }
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
    .join("; ");
  console.error(`Error: invalid environment configuration: ${details}`);
  process.exit(1);
})();

const stakingEnabled = Boolean(env.STARKNET_STAKING_CONTRACT);

// ---------------------------------------------------------------------------
// Address validation
// ---------------------------------------------------------------------------
function validateAddress(address: string, label: string): Address {
  if (!FELT_REGEX.test(address)) {
    throw new Error(
      `Invalid ${label} address: "${address}". Must be a hex string starting with 0x (1-64 hex chars).`
    );
  }
  try {
    return fromAddress(address);
  } catch (err) {
    throw new Error(
      `Invalid ${label} address: "${address}". ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

// ---------------------------------------------------------------------------
// SDK + wallet singleton (lazy init)
// ---------------------------------------------------------------------------
let sdkSingleton: StarkSDK | undefined;
let walletSingleton: Wallet | undefined;

function getSdk(): StarkSDK {
  if (!sdkSingleton) {
    sdkSingleton = new StarkSDK({
      network,
      ...(env.STARKNET_RPC_URL && { rpcUrl: env.STARKNET_RPC_URL }),
      ...(env.STARKNET_STAKING_CONTRACT && {
        staking: {
          contract: fromAddress(env.STARKNET_STAKING_CONTRACT),
        },
      }),
    });
  }
  return sdkSingleton;
}

async function getWallet(): Promise<Wallet> {
  if (!walletSingleton) {
    walletSingleton = await getSdk().connectWallet({
      account: {
        signer: new StarkSigner(env.STARKNET_PRIVATE_KEY),
      },
    });
  }
  return walletSingleton;
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
  const staking = await wallet.staking(poolAddress);
  const poolToken = extractPoolToken(staking);
  if (!poolToken) {
    throw new Error(
      "Could not resolve pool token metadata from SDK staking instance. Update the StarkZap SDK."
    );
  }
  assertPoolTokenHintMatches(poolToken, tokenHint, resolveToken);
  return poolToken;
}

async function handleTool(
  name: string,
  rawArgs: Record<string, unknown>
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
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
    if (name !== "x_execute" && !enableWrite && !enableExecute) {
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
      const balance = await wallet.balanceOf(token);
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
      const transfers = parsed.transfers.map((transfer) => {
        const amount = Amount.parse(transfer.amount, token);
        assertAmountWithinCap(amount, token, maxAmount);
        return {
          to: validateAddress(transfer.to, "recipient"),
          amount,
        };
      });

      assertBatchAmountWithinCap(
        transfers.map((transfer) => transfer.amount),
        token,
        maxBatchAmount
      );

      const feeMode = parsed.sponsored ? "sponsored" : undefined;
      const tx = await wallet.transfer(token, transfers, {
        ...(feeMode && { feeMode: feeMode as "sponsored" }),
      });
      await waitWithTimeout(tx);
      return ok({
        hash: tx.hash,
        explorerUrl: tx.explorerUrl,
        transfers: transfers.map((transfer) => ({
          to: transfer.to,
          amount: transfer.amount.toUnit(),
          symbol: token.symbol,
        })),
      });
    }

    case "x_execute": {
      const parsed = args as z.infer<typeof schemas.x_execute>;
      const calls = parsed.calls.map((call) => ({
        contractAddress: validateAddress(call.contractAddress, "contract"),
        entrypoint: call.entrypoint,
        calldata: call.calldata ?? [],
      }));
      const feeMode = parsed.sponsored ? "sponsored" : undefined;
      const tx = await wallet.execute(calls, {
        ...(feeMode && { feeMode: feeMode as "sponsored" }),
      });
      await waitWithTimeout(tx);
      return ok({
        hash: tx.hash,
        explorerUrl: tx.explorerUrl,
        callCount: calls.length,
      });
    }

    case "x_deploy_account": {
      const parsed = args as z.infer<typeof schemas.x_deploy_account>;
      if (await wallet.isDeployed()) {
        return ok({
          status: "already_deployed",
          address: wallet.address,
        });
      }
      const feeMode = parsed.sponsored ? "sponsored" : undefined;
      const tx = await wallet.deploy({
        ...(feeMode && { feeMode: feeMode as "sponsored" }),
      });
      await waitWithTimeout(tx);
      return ok({
        status: "deployed",
        hash: tx.hash,
        explorerUrl: tx.explorerUrl,
        address: wallet.address,
      });
    }

    case "x_enter_pool": {
      const parsed = args as z.infer<typeof schemas.x_enter_pool>;
      const poolAddress = validateAddress(parsed.pool, "pool");
      const poolToken = await resolvePoolTokenForOperation(
        wallet,
        poolAddress,
        parsed.token
      );
      const amount = Amount.parse(parsed.amount, poolToken);
      assertAmountWithinCap(amount, poolToken, maxAmount);
      const tx = await wallet.enterPool(poolAddress, amount);
      await waitWithTimeout(tx);
      return ok({
        hash: tx.hash,
        explorerUrl: tx.explorerUrl,
        pool: poolAddress,
        amount: amount.toUnit(),
        symbol: poolToken.symbol,
      });
    }

    case "x_add_to_pool": {
      const parsed = args as z.infer<typeof schemas.x_add_to_pool>;
      const poolAddress = validateAddress(parsed.pool, "pool");
      const poolToken = await resolvePoolTokenForOperation(
        wallet,
        poolAddress,
        parsed.token
      );
      const amount = Amount.parse(parsed.amount, poolToken);
      assertAmountWithinCap(amount, poolToken, maxAmount);
      const tx = await wallet.addToPool(poolAddress, amount);
      await waitWithTimeout(tx);
      return ok({
        hash: tx.hash,
        explorerUrl: tx.explorerUrl,
        pool: poolAddress,
        amount: amount.toUnit(),
        symbol: poolToken.symbol,
      });
    }

    case "x_claim_rewards": {
      const parsed = args as z.infer<typeof schemas.x_claim_rewards>;
      const poolAddress = validateAddress(parsed.pool, "pool");
      const poolToken = await resolvePoolTokenForOperation(wallet, poolAddress);
      const position = await wallet.getPoolPosition(poolAddress);
      if (!position) {
        throw new Error(
          `Cannot claim rewards: wallet is not a member of pool ${poolAddress}.`
        );
      }
      assertAmountWithinCap(position.rewards, poolToken, maxAmount);
      const tx = await wallet.claimPoolRewards(poolAddress);
      await waitWithTimeout(tx);
      return ok({
        hash: tx.hash,
        explorerUrl: tx.explorerUrl,
        pool: poolAddress,
      });
    }

    case "x_exit_pool_intent": {
      const parsed = args as z.infer<typeof schemas.x_exit_pool_intent>;
      const poolAddress = validateAddress(parsed.pool, "pool");
      const poolToken = await resolvePoolTokenForOperation(
        wallet,
        poolAddress,
        parsed.token
      );
      const amount = Amount.parse(parsed.amount, poolToken);
      assertAmountWithinCap(amount, poolToken, maxAmount);
      const tx = await wallet.exitPoolIntent(poolAddress, amount);
      await waitWithTimeout(tx);
      return ok({
        hash: tx.hash,
        explorerUrl: tx.explorerUrl,
        pool: poolAddress,
        amount: amount.toUnit(),
        symbol: poolToken.symbol,
        note: "Tokens stop earning rewards now. Call x_exit_pool after the waiting period.",
      });
    }

    case "x_exit_pool": {
      const parsed = args as z.infer<typeof schemas.x_exit_pool>;
      const poolAddress = validateAddress(parsed.pool, "pool");
      const poolToken = await resolvePoolTokenForOperation(wallet, poolAddress);
      const position = await wallet.getPoolPosition(poolAddress);
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
      assertAmountWithinCap(position.unpooling, poolToken, maxAmount);
      const tx = await wallet.exitPool(poolAddress);
      await waitWithTimeout(tx);
      return ok({
        hash: tx.hash,
        explorerUrl: tx.explorerUrl,
        pool: poolAddress,
      });
    }

    case "x_get_pool_position": {
      const parsed = args as z.infer<typeof schemas.x_get_pool_position>;
      const poolAddress = validateAddress(parsed.pool, "pool");
      const position = await wallet.getPoolPosition(poolAddress);
      if (!position) {
        return ok({
          pool: poolAddress,
          isMember: false,
        });
      }
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
        unpoolTime: position.unpoolTime?.toISOString() ?? null,
      });
    }

    case "x_estimate_fee": {
      const parsed = args as z.infer<typeof schemas.x_estimate_fee>;
      const calls = parsed.calls.map((call) => ({
        contractAddress: validateAddress(call.contractAddress, "contract"),
        entrypoint: call.entrypoint,
        calldata: call.calldata ?? [],
      }));
      const fee = await wallet.estimateFee(calls);
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
  try {
    return await handleTool(name, (toolArgs ?? {}) as Record<string, unknown>);
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
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text" as const, text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `x-mcp server running (network: ${network}, transport: stdio, ` +
      `write: ${enableWrite || enableExecute ? "ENABLED" : "disabled"}, ` +
      `execute: ${enableExecute ? "ENABLED" : "disabled"}, ` +
      `staking: ${stakingEnabled ? "ENABLED" : "disabled"}, ` +
      `max-amount: ${maxAmount}, max-batch-amount: ${maxBatchAmount})`
  );
}

const isMainModule =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}
