#!/usr/bin/env node

/**
 * x MCP Server
 *
 * Exposes Starknet wallet operations as MCP tools via the x SDK.
 * Works with any MCP-compatible client: Claude, Cursor, OpenAI Agents SDK, etc.
 *
 * Tools (read-only):
 *   - x_get_balance       Check ERC20 token balance
 *   - x_get_pool_position Query staking position in a pool
 *   - x_estimate_fee      Estimate gas cost for a set of calls
 *
 * Tools (state-changing — disabled by default, opt-in via --enable-write):
 *   - x_transfer          Send tokens to one or more recipients
 *   - x_deploy_account    Deploy the account contract on-chain
 *   - x_enter_pool        Enter a staking/delegation pool
 *   - x_add_to_pool       Add more tokens to an existing stake
 *   - x_claim_rewards     Claim staking rewards from a pool
 *   - x_exit_pool_intent  Start the exit process from a pool
 *   - x_exit_pool         Complete the exit after the waiting period
 *
 * Tools (unrestricted — disabled by default, opt-in via --enable-execute):
 *   - x_execute           Execute raw contract calls
 *
 * Security:
 *   - All state-changing tools disabled unless --enable-write is passed
 *   - All addresses are validated before use
 *   - Operation amounts are bounded by --max-amount (default: 1000)
 *   - x_execute requires separate --enable-execute flag
 *   - Tool argument schemas are validated at runtime with zod
 *
 * Usage:
 *   STARKNET_PRIVATE_KEY=0x... npx @keep-starknet-strange/x-mcp --network mainnet
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import crypto from "node:crypto";
import {
  StarkSDK,
  StarkSigner,
  Amount,
  fromAddress,
  mainnetTokens,
  sepoliaTokens,
} from "x";
import type { Wallet } from "x";
import type { Address, Token } from "x";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const cliArgs = process.argv.slice(2);
function getArgMaybe(name: string): string | undefined {
  const idx = cliArgs.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  const v = cliArgs[idx + 1];
  if (!v || v.startsWith("--")) return undefined;
  return v;
}
function getArg(name: string, fallback: string): string {
  return getArgMaybe(name) ?? fallback;
}
function hasFlag(name: string): boolean {
  return cliArgs.includes(`--${name}`);
}

const VALID_NETWORKS = ["mainnet", "sepolia"] as const;
type Network = (typeof VALID_NETWORKS)[number];

const rawNetwork = getArg("network", "mainnet");
if (!VALID_NETWORKS.includes(rawNetwork as Network)) {
  console.error(
    `Error: Invalid --network value "${rawNetwork}". Must be one of: ${VALID_NETWORKS.join(", ")}`
  );
  process.exit(1);
}
const network: Network = rawNetwork as Network;

const enableWrite = hasFlag("enable-write");
const enableExecute = hasFlag("enable-execute");
const maxAmount = getArg("max-amount", "1000"); // human-readable cap per write operation
const requireConfirmation = hasFlag("require-confirmation");
const confirmationTtlMsRaw = getArg("confirmation-ttl-ms", "60000");
const maxWritesPerMinuteRaw = getArg("max-writes-per-minute", "0"); // 0 = unlimited

if (!/^\d+(\.\d+)?$/.test(maxAmount) || Number(maxAmount) <= 0) {
  console.error(
    `Error: Invalid --max-amount value "${maxAmount}". Must be a positive number (e.g. 1000, 0.1).`
  );
  process.exit(1);
}
const confirmationTtlMs = Number.parseInt(confirmationTtlMsRaw, 10);
if (!Number.isFinite(confirmationTtlMs) || confirmationTtlMs <= 0) {
  console.error(
    `Error: Invalid --confirmation-ttl-ms value "${confirmationTtlMsRaw}". Must be a positive integer.`
  );
  process.exit(1);
}
const maxWritesPerMinute = Number.parseInt(maxWritesPerMinuteRaw, 10);
if (!Number.isFinite(maxWritesPerMinute) || maxWritesPerMinute < 0) {
  console.error(
    `Error: Invalid --max-writes-per-minute value "${maxWritesPerMinuteRaw}". Must be 0 (unlimited) or a non-negative integer.`
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const envSchema = z.object({
  STARKNET_PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{1,64}$/, "Invalid STARKNET_PRIVATE_KEY format"),
  STARKNET_RPC_URL: z.string().url().optional(),
  STARKNET_STAKING_CONTRACT: z
    .string()
    .regex(/^0x[0-9a-fA-F]{1,64}$/, "Invalid STARKNET_STAKING_CONTRACT format")
    .optional(),
});

const env = envSchema.parse(process.env);

// ---------------------------------------------------------------------------
// Address validation
// ---------------------------------------------------------------------------
const FELT_REGEX = /^0x[0-9a-fA-F]{1,64}$/;

/**
 * Validates and parses a Starknet address using the x SDK's fromAddress(),
 * which delegates to starknet.js validateAndParseAddress(). Returns a
 * properly branded Address type.
 */
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
let _sdk: StarkSDK | undefined;
let _wallet: Wallet | undefined;

function getSdk(): StarkSDK {
  if (!_sdk) {
    _sdk = new StarkSDK({
      network,
      ...(env.STARKNET_RPC_URL && { rpcUrl: env.STARKNET_RPC_URL }),
      ...(env.STARKNET_STAKING_CONTRACT && {
        staking: {
          contract: fromAddress(env.STARKNET_STAKING_CONTRACT),
        },
      }),
    });
  }
  return _sdk;
}

async function getWallet(): Promise<Wallet> {
  if (!_wallet) {
    const sdk = getSdk();
    _wallet = await sdk.connectWallet({
      account: {
        signer: new StarkSigner(env.STARKNET_PRIVATE_KEY),
      },
    });
  }
  return _wallet;
}

// ---------------------------------------------------------------------------
// Execution controls (confirmation, rate limiting, write serialization, logging)
// ---------------------------------------------------------------------------
type PendingAction = {
  id: string;
  code: string;
  name: string;
  args: Record<string, unknown>;
  createdAtMs: number;
  expiresAtMs: number;
};

const pendingActions = new Map<string, PendingAction>();
const MAX_PENDING_ACTIONS = 25;

function audit(event: Record<string, unknown>): void {
  // JSONL on stderr (never on stdout which is used for MCP transport).
  console.error(
    JSON.stringify({ ts: new Date().toISOString(), network, ...event })
  );
}

function newPendingId(): string {
  return crypto.randomUUID();
}

function newConfirmationCode(): string {
  // Short human-copyable code; not returned to the tool caller.
  return crypto.randomBytes(3).toString("hex"); // 6 hex chars
}

const writeTimestampsMs: number[] = [];
function pruneWriteTimestamps(nowMs: number): void {
  const windowStart = nowMs - 60_000;
  while (writeTimestampsMs.length > 0 && writeTimestampsMs[0]! < windowStart) {
    writeTimestampsMs.shift();
  }
}
function assertWriteRateLimit(): void {
  if (maxWritesPerMinute === 0) return;
  const now = Date.now();
  pruneWriteTimestamps(now);
  if (writeTimestampsMs.length >= maxWritesPerMinute) {
    throw new Error(
      `Rate limit exceeded: max ${maxWritesPerMinute} write operations per minute.`
    );
  }
}
function noteWriteExecuted(): void {
  const now = Date.now();
  writeTimestampsMs.push(now);
  pruneWriteTimestamps(now);
}

let writeChain: Promise<void> = Promise.resolve();
async function runSerializedWrite<T>(fn: () => Promise<T>): Promise<T> {
  const prev = writeChain;
  let release: (() => void) | undefined;
  writeChain = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prev;
  try {
    return await fn();
  } finally {
    release?.();
  }
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------
// mainnetTokens and sepoliaTokens are `as const satisfies Record<string, Token>`
// so they are assignable to Record<string, Token> directly.
const tokensByNetwork: Record<string, Record<string, Token>> = {
  mainnet: mainnetTokens,
  sepolia: sepoliaTokens,
};

function resolveToken(symbolOrAddress: string): Token {
  const tokens = tokensByNetwork[network] ?? {};

  // Try by symbol (case-insensitive)
  const upper = symbolOrAddress.toUpperCase();
  const bySymbol = Object.values(tokens).find(
    (t) => t.symbol.toUpperCase() === upper
  );
  if (bySymbol) return bySymbol;

  // Try by address (only from known presets — unknown addresses are rejected for safety)
  if (FELT_REGEX.test(symbolOrAddress)) {
    const byAddress = Object.values(tokens).find(
      (t) =>
        (t.address as string).toLowerCase() === symbolOrAddress.toLowerCase()
    );
    if (byAddress) return byAddress;
  }

  const available = Object.values(tokens)
    .map((t) => t.symbol)
    .join(", ");
  throw new Error(
    `Unknown token: "${symbolOrAddress}". Available tokens: ${available}. ` +
      `Only pre-verified tokens are supported for safety. ` +
      `To add a custom token, update the x SDK token presets.`
  );
}

// ---------------------------------------------------------------------------
// Runtime argument validation schemas
// ---------------------------------------------------------------------------
const addressSchema = z.string().regex(FELT_REGEX, "Invalid Starknet address");
const amountSchema = z
  .string()
  .regex(/^\d+(\.\d+)?$/, "Amount must be a positive number");

const schemas = {
  x_get_balance: z.object({
    token: z.string().min(1),
  }),
  x_transfer: z.object({
    token: z.string().min(1),
    transfers: z
      .array(
        z.object({
          to: addressSchema,
          amount: amountSchema,
        })
      )
      .min(1)
      .max(20, "Maximum 20 transfers per batch"),
    sponsored: z.boolean().optional(),
  }),
  x_execute: z.object({
    calls: z
      .array(
        z.object({
          contractAddress: addressSchema,
          entrypoint: z.string().min(1),
          calldata: z.array(z.string()).optional(),
        })
      )
      .min(1)
      .max(10, "Maximum 10 calls per batch"),
    sponsored: z.boolean().optional(),
  }),
  x_deploy_account: z.object({
    sponsored: z.boolean().optional(),
  }),
  x_enter_pool: z.object({
    pool: addressSchema,
    amount: amountSchema,
    token: z.string().optional(),
  }),
  x_add_to_pool: z.object({
    pool: addressSchema,
    amount: amountSchema,
    token: z.string().optional(),
  }),
  x_claim_rewards: z.object({
    pool: addressSchema,
  }),
  x_exit_pool_intent: z.object({
    pool: addressSchema,
    amount: amountSchema,
    token: z.string().optional(),
  }),
  x_exit_pool: z.object({
    pool: addressSchema,
  }),
  x_get_pool_position: z.object({
    pool: addressSchema,
  }),
  x_estimate_fee: z.object({
    calls: z
      .array(
        z.object({
          contractAddress: addressSchema,
          entrypoint: z.string().min(1),
          calldata: z.array(z.string()).optional(),
        })
      )
      .min(1),
  }),
  x_confirm: z.object({
    id: z.string().min(1),
    code: z.string().min(1),
  }),
} as const;

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------
const allTools: Tool[] = [
  {
    name: "x_get_balance",
    description:
      "Get the wallet's ERC20 token balance. Returns human-readable and raw values.",
    inputSchema: {
      type: "object" as const,
      properties: {
        token: {
          type: "string",
          description:
            "Token symbol (ETH, STRK, USDC, etc.) or contract address",
        },
      },
      required: ["token"],
    },
  },
  {
    name: "x_transfer",
    description:
      `Transfer ERC20 tokens to one or more recipients in a single transaction. ` +
      `Maximum ${maxAmount} tokens per individual transfer. Maximum 20 recipients per batch.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        token: {
          type: "string",
          description: "Token symbol or contract address",
        },
        transfers: {
          type: "array",
          items: {
            type: "object",
            properties: {
              to: { type: "string", description: "Recipient address (0x...)" },
              amount: {
                type: "string",
                description: `Human-readable amount (e.g. "10.5"). Max ${maxAmount} per transfer.`,
              },
            },
            required: ["to", "amount"],
          },
          description: "One or more {to, amount} transfers (max 20)",
        },
        sponsored: {
          type: "boolean",
          description: "Use paymaster for gasless tx (default: false)",
        },
      },
      required: ["token", "transfers"],
    },
  },
  {
    name: "x_execute",
    description:
      "Execute one or more raw contract calls atomically. RESTRICTED: only available when server is started with --enable-execute flag. Maximum 10 calls per batch.",
    inputSchema: {
      type: "object" as const,
      properties: {
        calls: {
          type: "array",
          items: {
            type: "object",
            properties: {
              contractAddress: {
                type: "string",
                description: "Contract address",
              },
              entrypoint: {
                type: "string",
                description: "Function name to call",
              },
              calldata: {
                type: "array",
                items: { type: "string" },
                description: "Calldata as array of strings",
              },
            },
            required: ["contractAddress", "entrypoint"],
          },
        },
        sponsored: {
          type: "boolean",
          description: "Use paymaster for gasless tx (default: false)",
        },
      },
      required: ["calls"],
    },
  },
  {
    name: "x_deploy_account",
    description:
      "Deploy the account contract on-chain. Must be called before the account can send transactions (unless using sponsored mode, which auto-deploys).",
    inputSchema: {
      type: "object" as const,
      properties: {
        sponsored: {
          type: "boolean",
          description: "Use paymaster for gasless deploy (default: false)",
        },
      },
    },
  },
  {
    name: "x_enter_pool",
    description: `Enter a staking/delegation pool as a new member. Handles token approval automatically. Maximum ${maxAmount} tokens per operation.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        pool: {
          type: "string",
          description: "Pool contract address",
        },
        amount: {
          type: "string",
          description: 'Amount of STRK to stake (e.g. "100")',
        },
        token: {
          type: "string",
          description: "Token symbol (default: STRK)",
        },
      },
      required: ["pool", "amount"],
    },
  },
  {
    name: "x_add_to_pool",
    description: `Add more tokens to an existing stake in a pool. Maximum ${maxAmount} tokens per operation.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        pool: {
          type: "string",
          description: "Pool contract address",
        },
        amount: {
          type: "string",
          description: "Amount to add",
        },
        token: {
          type: "string",
          description: "Token symbol (default: STRK)",
        },
      },
      required: ["pool", "amount"],
    },
  },
  {
    name: "x_claim_rewards",
    description: "Claim accumulated staking rewards from a pool.",
    inputSchema: {
      type: "object" as const,
      properties: {
        pool: {
          type: "string",
          description: "Pool contract address",
        },
      },
      required: ["pool"],
    },
  },
  {
    name: "x_exit_pool_intent",
    description: `Start the exit process from a pool. Maximum ${maxAmount} tokens per operation. Tokens stop earning rewards immediately. Must wait for the exit window before calling x_exit_pool.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        pool: {
          type: "string",
          description: "Pool contract address",
        },
        amount: {
          type: "string",
          description: "Amount to unstake",
        },
        token: {
          type: "string",
          description: "Token symbol (default: STRK)",
        },
      },
      required: ["pool", "amount"],
    },
  },
  {
    name: "x_exit_pool",
    description:
      "Complete the exit from a pool after the waiting period. Returns staked tokens to the wallet.",
    inputSchema: {
      type: "object" as const,
      properties: {
        pool: {
          type: "string",
          description: "Pool contract address",
        },
      },
      required: ["pool"],
    },
  },
  {
    name: "x_get_pool_position",
    description:
      "Get the wallet's staking position in a pool: staked amount, rewards, commission, exit status.",
    inputSchema: {
      type: "object" as const,
      properties: {
        pool: {
          type: "string",
          description: "Pool contract address",
        },
      },
      required: ["pool"],
    },
  },
  {
    name: "x_estimate_fee",
    description:
      "Estimate the gas fee for one or more contract calls. Returns overall_fee and resource bounds (l1_gas, l2_gas, l1_data_gas).",
    inputSchema: {
      type: "object" as const,
      properties: {
        calls: {
          type: "array",
          items: {
            type: "object",
            properties: {
              contractAddress: {
                type: "string",
                description: "Contract address",
              },
              entrypoint: {
                type: "string",
                description: "Function name to call",
              },
              calldata: {
                type: "array",
                items: { type: "string" },
                description: "Calldata as array of strings",
              },
            },
            required: ["contractAddress", "entrypoint"],
          },
        },
      },
      required: ["calls"],
    },
  },
  {
    name: "x_confirm",
    description:
      "Confirm and execute a previously staged write operation. Only available when server is started with --require-confirmation. The confirmation code is printed to the server logs (stderr).",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "Pending operation id returned by the staged tool call",
        },
        code: {
          type: "string",
          description:
            "Confirmation code printed to the server logs (stderr) when the operation was staged",
        },
      },
      required: ["id", "code"],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool access control
// ---------------------------------------------------------------------------
const READ_ONLY_TOOLS = new Set([
  "x_get_balance",
  "x_get_pool_position",
  "x_estimate_fee",
]);

const STAKING_TOOLS = new Set([
  "x_enter_pool",
  "x_add_to_pool",
  "x_claim_rewards",
  "x_exit_pool_intent",
  "x_exit_pool",
  "x_get_pool_position",
]);

const tools: Tool[] = allTools.filter((t) => {
  if (READ_ONLY_TOOLS.has(t.name)) return true;
  if (t.name === "x_confirm")
    return requireConfirmation && (enableWrite || enableExecute);
  if (t.name === "x_execute") return enableExecute;
  return enableWrite || enableExecute; // --enable-execute implies write access
});

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

/** Validates a single operation amount against the configured cap. */
function assertAmountWithinCap(
  amount: Amount,
  token: Token,
  cap: string
): void {
  const capAmount = Amount.parse(cap, token);
  if (amount.gt(capAmount)) {
    throw new Error(
      `Amount ${amount.toUnit()} ${token.symbol} exceeds the per-operation cap of ${cap}. ` +
        `Adjust --max-amount to increase the limit.`
    );
  }
}

const TX_WAIT_TIMEOUT_MS = 120_000; // 2 minutes

/** Wait for a tx with a timeout to avoid hanging forever. */
async function waitWithTimeout(
  tx: { wait: () => Promise<void>; hash: string },
  timeoutMs: number = TX_WAIT_TIMEOUT_MS
): Promise<void> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(
      () =>
        reject(
          new Error(
            `Transaction ${tx.hash} confirmation timed out after ${timeoutMs}ms`
          )
        ),
      timeoutMs
    )
  );
  await Promise.race([tx.wait(), timeout]);
}

function buildWritePreview(name: string, args: unknown): unknown {
  switch (name) {
    case "x_transfer": {
      const parsed = args as z.infer<typeof schemas.x_transfer>;
      const token = resolveToken(parsed.token);
      const transfers = parsed.transfers.map((t) => {
        const amount = Amount.parse(t.amount, token);
        assertAmountWithinCap(amount, token, maxAmount);
        return {
          to: validateAddress(t.to, "recipient"),
          amount: amount.toUnit(),
          symbol: token.symbol,
        };
      });
      return {
        token: token.symbol,
        transfers,
        sponsored: parsed.sponsored ?? false,
      };
    }
    case "x_execute": {
      const parsed = args as z.infer<typeof schemas.x_execute>;
      const calls = parsed.calls.map((c) => ({
        contractAddress: validateAddress(c.contractAddress, "contract"),
        entrypoint: c.entrypoint,
        calldataLength: (c.calldata ?? []).length,
      }));
      return {
        callCount: calls.length,
        calls,
        sponsored: parsed.sponsored ?? false,
        warning:
          "x_execute is unrestricted. Prefer enabling contract allowlists for production.",
      };
    }
    case "x_deploy_account": {
      const parsed = args as z.infer<typeof schemas.x_deploy_account>;
      return {
        sponsored: parsed.sponsored ?? false,
        note: "Account address will be derived at execution time.",
      };
    }
    case "x_enter_pool": {
      const parsed = args as z.infer<typeof schemas.x_enter_pool>;
      const token = resolveToken(parsed.token ?? "STRK");
      const amount = Amount.parse(parsed.amount, token);
      assertAmountWithinCap(amount, token, maxAmount);
      const pool = validateAddress(parsed.pool, "pool");
      return { pool, amount: amount.toUnit(), symbol: token.symbol };
    }
    case "x_add_to_pool": {
      const parsed = args as z.infer<typeof schemas.x_add_to_pool>;
      const token = resolveToken(parsed.token ?? "STRK");
      const amount = Amount.parse(parsed.amount, token);
      assertAmountWithinCap(amount, token, maxAmount);
      const pool = validateAddress(parsed.pool, "pool");
      return { pool, amount: amount.toUnit(), symbol: token.symbol };
    }
    case "x_claim_rewards": {
      const parsed = args as z.infer<typeof schemas.x_claim_rewards>;
      const pool = validateAddress(parsed.pool, "pool");
      return { pool };
    }
    case "x_exit_pool_intent": {
      const parsed = args as z.infer<typeof schemas.x_exit_pool_intent>;
      const token = resolveToken(parsed.token ?? "STRK");
      const amount = Amount.parse(parsed.amount, token);
      assertAmountWithinCap(amount, token, maxAmount);
      const pool = validateAddress(parsed.pool, "pool");
      return { pool, amount: amount.toUnit(), symbol: token.symbol };
    }
    case "x_exit_pool": {
      const parsed = args as z.infer<typeof schemas.x_exit_pool>;
      const pool = validateAddress(parsed.pool, "pool");
      return { pool };
    }
    default:
      throw new Error(`Cannot build preview for tool: ${name}`);
  }
}

async function handleTool(
  requestedName: string,
  rawArgs: Record<string, unknown>
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const ok = (data: unknown) => ({
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  });

  let name = requestedName;
  let argsForTool: Record<string, unknown> = rawArgs;
  let confirmedExecution = false;

  // Confirmation flow: convert x_confirm(id, code) into the actual pending tool call.
  if (requestedName === "x_confirm") {
    if (!requireConfirmation) {
      throw new Error(
        "x_confirm is disabled. Start the server with --require-confirmation to stage and confirm write operations."
      );
    }
    if (!enableWrite && !enableExecute) {
      throw new Error(
        "x_confirm requires write access. Start the server with --enable-write (or --enable-execute)."
      );
    }
    const confirmArgs = schemas.x_confirm.parse(rawArgs);
    const pending = pendingActions.get(confirmArgs.id);
    if (!pending) {
      throw new Error(`No pending operation found for id "${confirmArgs.id}".`);
    }
    if (Date.now() > pending.expiresAtMs) {
      pendingActions.delete(confirmArgs.id);
      throw new Error(`Pending operation "${confirmArgs.id}" has expired.`);
    }
    if (pending.code !== confirmArgs.code) {
      throw new Error("Invalid confirmation code.");
    }
    pendingActions.delete(confirmArgs.id);
    name = pending.name;
    argsForTool = pending.args;
    confirmedExecution = true;
    audit({
      event: "write_confirmed",
      tool: name,
      pendingId: confirmArgs.id,
    });
  }

  // Runtime schema validation
  const schema = schemas[name as keyof typeof schemas];
  if (!schema) {
    throw new Error(`Unknown tool: ${name}`);
  }
  const args = schema.parse(argsForTool);

  const isReadOnly = READ_ONLY_TOOLS.has(name);
  const isWriteTool = !isReadOnly;

  audit({
    event: "tool_call",
    tool: requestedName,
    resolvedTool: name,
    write: isWriteTool,
    requireConfirmation,
    confirmedExecution,
  });

  // Enforce write-tool gate at runtime (defense-in-depth: tool list is already
  // filtered, but a malicious client could call tools by name directly).
  if (isWriteTool) {
    if (name === "x_execute" && !enableExecute) {
      throw new Error(
        "x_execute is disabled. Start the server with --enable-execute to allow raw contract calls. " +
          "WARNING: this gives the agent unrestricted access to execute any contract call."
      );
    }
    if (name !== "x_execute" && !enableWrite && !enableExecute) {
      throw new Error(
        `${name} is a state-changing tool and is disabled by default. ` +
          `Start the server with --enable-write to allow write operations.`
      );
    }
  }

  // Staking tools require STARKNET_STAKING_CONTRACT to be configured.
  if (STAKING_TOOLS.has(name) && !env.STARKNET_STAKING_CONTRACT) {
    throw new Error(
      `${name} requires the STARKNET_STAKING_CONTRACT environment variable to be set.`
    );
  }

  // Confirmation staging: when enabled, stage write operations and require
  // a follow-up x_confirm with an out-of-band code (printed to stderr).
  if (requireConfirmation && isWriteTool && !confirmedExecution) {
    const now = Date.now();
    for (const [id, pending] of pendingActions) {
      if (pending.expiresAtMs <= now) pendingActions.delete(id);
    }
    if (pendingActions.size >= MAX_PENDING_ACTIONS) {
      throw new Error(
        `Too many pending operations (${pendingActions.size}). Confirm or wait for expiry before staging more.`
      );
    }
    const preview = buildWritePreview(name, args);
    const id = newPendingId();
    const code = newConfirmationCode();
    const expiresAtMs = now + confirmationTtlMs;
    pendingActions.set(id, {
      id,
      code,
      name,
      args: args as Record<string, unknown>,
      createdAtMs: now,
      expiresAtMs,
    });
    audit({ event: "write_staged", tool: name, pendingId: id, expiresAtMs });
    console.error(
      `[x-mcp] confirmation required: id=${id} code=${code} tool=${name} expires=${new Date(expiresAtMs).toISOString()}`
    );
    return ok({
      status: "pending_confirmation",
      id,
      tool: name,
      expiresAt: new Date(expiresAtMs).toISOString(),
      preview,
      note: "Call x_confirm with {id, code} (code is printed to server logs) to execute.",
    });
  }

  if (name === "x_confirm") {
    // x_confirm is handled above by resolving to a pending action.
    throw new Error("Internal error: unresolved x_confirm.");
  }

  if (isWriteTool) {
    assertWriteRateLimit();
    // Count all write-tool executions (including no-ops) to prevent tight loops.
    noteWriteExecuted();
  }

  const exec = async () => {
    const wallet = await getWallet();
    switch (name) {
      // -----------------------------------------------------------------------
      // Balance (read-only)
      // -----------------------------------------------------------------------
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

      // -----------------------------------------------------------------------
      // Transfer (state-changing, amount-capped)
      // -----------------------------------------------------------------------
      case "x_transfer": {
        const parsed = args as z.infer<typeof schemas.x_transfer>;
        const token = resolveToken(parsed.token);
        const transfers = parsed.transfers.map((t) => {
          const amount = Amount.parse(t.amount, token);
          assertAmountWithinCap(amount, token, maxAmount);
          return {
            to: validateAddress(t.to, "recipient"),
            amount,
          };
        });
        const feeMode = parsed.sponsored ? "sponsored" : undefined;
        const tx = await wallet.transfer(token, transfers, {
          ...(feeMode && { feeMode: feeMode as "sponsored" }),
        });
        await waitWithTimeout(tx);
        return ok({
          hash: tx.hash,
          explorerUrl: tx.explorerUrl,
          transfers: transfers.map((t) => ({
            to: t.to,
            amount: t.amount.toUnit(),
            symbol: token.symbol,
          })),
        });
      }

      // -----------------------------------------------------------------------
      // Execute (state-changing, restricted)
      // -----------------------------------------------------------------------
      case "x_execute": {
        const parsed = args as z.infer<typeof schemas.x_execute>;
        const calls = parsed.calls.map((c) => ({
          contractAddress: validateAddress(c.contractAddress, "contract"),
          entrypoint: c.entrypoint,
          calldata: c.calldata ?? [],
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

      // -----------------------------------------------------------------------
      // Deploy (state-changing)
      // -----------------------------------------------------------------------
      case "x_deploy_account": {
        const parsed = args as z.infer<typeof schemas.x_deploy_account>;
        const deployed = await wallet.isDeployed();
        if (deployed) {
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

      // -----------------------------------------------------------------------
      // Staking — enter pool
      // -----------------------------------------------------------------------
      case "x_enter_pool": {
        const parsed = args as z.infer<typeof schemas.x_enter_pool>;
        const token = resolveToken(parsed.token ?? "STRK");
        const amount = Amount.parse(parsed.amount, token);
        assertAmountWithinCap(amount, token, maxAmount);
        const poolAddr = validateAddress(parsed.pool, "pool");
        const tx = await wallet.enterPool(poolAddr, amount);
        await waitWithTimeout(tx);
        return ok({
          hash: tx.hash,
          explorerUrl: tx.explorerUrl,
          pool: poolAddr,
          amount: amount.toUnit(),
          symbol: token.symbol,
        });
      }

      // -----------------------------------------------------------------------
      // Staking — add to pool
      // -----------------------------------------------------------------------
      case "x_add_to_pool": {
        const parsed = args as z.infer<typeof schemas.x_add_to_pool>;
        const token = resolveToken(parsed.token ?? "STRK");
        const amount = Amount.parse(parsed.amount, token);
        assertAmountWithinCap(amount, token, maxAmount);
        const poolAddr = validateAddress(parsed.pool, "pool");
        const tx = await wallet.addToPool(poolAddr, amount);
        await waitWithTimeout(tx);
        return ok({
          hash: tx.hash,
          explorerUrl: tx.explorerUrl,
          pool: poolAddr,
          amount: amount.toUnit(),
          symbol: token.symbol,
        });
      }

      // -----------------------------------------------------------------------
      // Staking — claim rewards
      // -----------------------------------------------------------------------
      case "x_claim_rewards": {
        const parsed = args as z.infer<typeof schemas.x_claim_rewards>;
        const poolAddr = validateAddress(parsed.pool, "pool");
        const tx = await wallet.claimPoolRewards(poolAddr);
        await waitWithTimeout(tx);
        return ok({
          hash: tx.hash,
          explorerUrl: tx.explorerUrl,
          pool: poolAddr,
        });
      }

      // -----------------------------------------------------------------------
      // Staking — exit intent
      // -----------------------------------------------------------------------
      case "x_exit_pool_intent": {
        const parsed = args as z.infer<typeof schemas.x_exit_pool_intent>;
        const token = resolveToken(parsed.token ?? "STRK");
        const amount = Amount.parse(parsed.amount, token);
        assertAmountWithinCap(amount, token, maxAmount);
        const poolAddr = validateAddress(parsed.pool, "pool");
        const tx = await wallet.exitPoolIntent(poolAddr, amount);
        await waitWithTimeout(tx);
        return ok({
          hash: tx.hash,
          explorerUrl: tx.explorerUrl,
          pool: poolAddr,
          amount: amount.toUnit(),
          symbol: token.symbol,
          note: "Tokens stop earning rewards now. Call x_exit_pool after the waiting period.",
        });
      }

      // -----------------------------------------------------------------------
      // Staking — exit pool (complete)
      // -----------------------------------------------------------------------
      case "x_exit_pool": {
        const parsed = args as z.infer<typeof schemas.x_exit_pool>;
        const poolAddr = validateAddress(parsed.pool, "pool");
        const tx = await wallet.exitPool(poolAddr);
        await waitWithTimeout(tx);
        return ok({
          hash: tx.hash,
          explorerUrl: tx.explorerUrl,
          pool: poolAddr,
        });
      }

      // -----------------------------------------------------------------------
      // Staking — get position (read-only)
      // -----------------------------------------------------------------------
      case "x_get_pool_position": {
        const parsed = args as z.infer<typeof schemas.x_get_pool_position>;
        const poolAddr = validateAddress(parsed.pool, "pool");
        const position = await wallet.getPoolPosition(poolAddr);
        if (!position) {
          return ok({
            pool: poolAddr,
            isMember: false,
          });
        }
        return ok({
          pool: poolAddr,
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

      // -----------------------------------------------------------------------
      // Estimate fee (read-only)
      // -----------------------------------------------------------------------
      case "x_estimate_fee": {
        const parsed = args as z.infer<typeof schemas.x_estimate_fee>;
        const calls = parsed.calls.map((c) => ({
          contractAddress: validateAddress(c.contractAddress, "contract"),
          entrypoint: c.entrypoint,
          calldata: c.calldata ?? [],
        }));
        const fee = await wallet.estimateFee(calls);
        // starknet.js v9 EstimateFeeResponseOverhead: { overall_fee, resourceBounds, unit }
        const { l1_gas, l2_gas, l1_data_gas } = fee.resourceBounds;
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
  };

  return isWriteTool ? runSerializedWrite(exec) : exec();
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

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: toolArgs } = request.params;
  try {
    return await handleTool(name, (toolArgs ?? {}) as Record<string, unknown>);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Include zod validation details if available
    const details =
      error instanceof z.ZodError
        ? error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ")
        : undefined;
    audit({
      event: "tool_error",
      tool: name,
      message,
      ...(details && { details }),
    });
    return {
      content: [
        {
          type: "text" as const,
          text: details ? `Validation error: ${details}` : `Error: ${message}`,
        },
      ],
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
      `confirm: ${requireConfirmation ? "ENABLED" : "disabled"}, ` +
      `max-amount: ${maxAmount}, ` +
      `max-writes-per-minute: ${
        maxWritesPerMinute === 0 ? "unlimited" : maxWritesPerMinute
      }, ` +
      `confirmation-ttl-ms: ${confirmationTtlMs})`
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
