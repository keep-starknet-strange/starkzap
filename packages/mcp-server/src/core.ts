import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { Amount, fromAddress, mainnetTokens, sepoliaTokens } from "starkzap";
import type { Address, Token } from "starkzap";
import { z } from "zod";

export const FELT_REGEX = /^0x[0-9a-fA-F]{1,64}$/;
export const VALID_NETWORKS = ["mainnet", "sepolia"] as const;
export type Network = (typeof VALID_NETWORKS)[number];

export interface CliConfig {
  network: Network;
  enableWrite: boolean;
  enableExecute: boolean;
  maxAmount: string;
  maxBatchAmount: string;
  rateLimitRpm: number;
  readRateLimitRpm: number;
  writeRateLimitRpm: number;
}

const tokensByNetwork: Record<Network, Record<string, Token>> = {
  mainnet: mainnetTokens,
  sepolia: sepoliaTokens,
};

export function normalizeStarknetAddress(address: string): string {
  return fromAddress(address).toLowerCase();
}

function getReferenceToken(network: Network): Token {
  const tokens = tokensByNetwork[network];
  const strk = Object.values(tokens).find((token) => token.symbol === "STRK");
  if (strk) {
    return strk;
  }
  const first = Object.values(tokens)[0];
  if (!first) {
    throw new Error(`No token presets available for network "${network}"`);
  }
  return first;
}

export function getArg(
  cliArgs: string[],
  name: string,
  fallback: string
): string {
  const idx = cliArgs.indexOf(`--${name}`);
  if (idx === -1) {
    return fallback;
  }
  const next = cliArgs[idx + 1];
  if (!next || next.startsWith("--")) {
    throw new Error(`Missing value for flag --${name}`);
  }
  return next;
}

export function hasFlag(cliArgs: string[], name: string): boolean {
  return cliArgs.includes(`--${name}`);
}

const VALUE_FLAGS = new Set([
  "network",
  "max-amount",
  "max-batch-amount",
  "rate-limit-rpm",
  "read-rate-limit-rpm",
  "write-rate-limit-rpm",
]);
const BOOLEAN_FLAGS = new Set(["enable-write", "enable-execute"]);

function validateKnownFlags(cliArgs: string[]): void {
  for (const token of cliArgs) {
    if (!token.startsWith("--")) {
      continue;
    }
    const flag = token.slice(2);
    if (!VALUE_FLAGS.has(flag) && !BOOLEAN_FLAGS.has(flag)) {
      const supported = [
        ...Array.from(VALUE_FLAGS).map((name) => `--${name} <value>`),
        ...Array.from(BOOLEAN_FLAGS).map((name) => `--${name}`),
      ].join(", ");
      throw new Error(`Unknown flag --${flag}. Supported flags: ${supported}`);
    }
  }
}

function parseNetwork(rawValue: string): Network {
  if (!VALID_NETWORKS.includes(rawValue as Network)) {
    throw new Error(
      `Invalid --network value "${rawValue}". Must be one of: ${VALID_NETWORKS.join(", ")}`
    );
  }
  return rawValue as Network;
}

function validatePositiveAmountLiteral(
  value: string,
  argName: string,
  network: Network
): void {
  const MAX_AMOUNT_LITERAL_CHARS = 32;
  if (value.length > MAX_AMOUNT_LITERAL_CHARS) {
    throw new Error(
      `Invalid --${argName} value "${value}". Must be <= ${MAX_AMOUNT_LITERAL_CHARS} characters.`
    );
  }
  if (!/^\d+(\.\d+)?$/.test(value)) {
    throw new Error(
      `Invalid --${argName} value "${value}". Must be a positive number.`
    );
  }
  const referenceToken = getReferenceToken(network);
  const parsed = Amount.parse(value, referenceToken);
  if (parsed.isZero()) {
    throw new Error(
      `Invalid --${argName} value "${value}". Must be greater than zero.`
    );
  }
}

function parseNonNegativeInteger(value: string, argName: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(
      `Invalid --${argName} value "${value}". Must be a non-negative integer.`
    );
  }
  return Number.parseInt(value, 10);
}

export function parseCliConfig(cliArgs: string[]): CliConfig {
  validateKnownFlags(cliArgs);
  const network = parseNetwork(getArg(cliArgs, "network", "mainnet"));
  const maxAmount = getArg(cliArgs, "max-amount", "1000");
  const maxBatchAmount = getArg(cliArgs, "max-batch-amount", maxAmount);
  const rateLimitRpm = parseNonNegativeInteger(
    getArg(cliArgs, "rate-limit-rpm", "0"),
    "rate-limit-rpm"
  );
  if (rateLimitRpm > 10_000) {
    throw new Error(
      `Invalid --rate-limit-rpm value "${rateLimitRpm}". Must be <= 10000.`
    );
  }
  const readRateLimitRpm = parseNonNegativeInteger(
    getArg(cliArgs, "read-rate-limit-rpm", "0"),
    "read-rate-limit-rpm"
  );
  if (readRateLimitRpm > 10_000) {
    throw new Error(
      `Invalid --read-rate-limit-rpm value "${readRateLimitRpm}". Must be <= 10000.`
    );
  }
  const writeRateLimitRpm = parseNonNegativeInteger(
    getArg(cliArgs, "write-rate-limit-rpm", "0"),
    "write-rate-limit-rpm"
  );
  if (writeRateLimitRpm > 10_000) {
    throw new Error(
      `Invalid --write-rate-limit-rpm value "${writeRateLimitRpm}". Must be <= 10000.`
    );
  }

  validatePositiveAmountLiteral(maxAmount, "max-amount", network);
  validatePositiveAmountLiteral(maxBatchAmount, "max-batch-amount", network);

  const enableWrite = hasFlag(cliArgs, "enable-write");
  const enableExecute = hasFlag(cliArgs, "enable-execute");

  return {
    network,
    enableWrite,
    enableExecute,
    maxAmount,
    maxBatchAmount,
    rateLimitRpm,
    readRateLimitRpm,
    writeRateLimitRpm,
  };
}

export function createTokenResolver(network: Network) {
  return (symbolOrAddress: string): Token => {
    const tokens = tokensByNetwork[network] ?? {};

    const bySymbol = Object.values(tokens).find(
      (token) => token.symbol.toUpperCase() === symbolOrAddress.toUpperCase()
    );
    if (bySymbol) {
      return bySymbol;
    }

    if (FELT_REGEX.test(symbolOrAddress)) {
      let normalizedInput: string;
      try {
        normalizedInput = normalizeStarknetAddress(symbolOrAddress);
      } catch {
        throw new Error(`Invalid token address: "${symbolOrAddress}".`);
      }
      const byAddress = Object.values(tokens).find(
        (token) => normalizeStarknetAddress(token.address) === normalizedInput
      );
      if (byAddress) {
        return byAddress;
      }
    }

    const availableSymbols = Object.values(tokens)
      .map((token) => token.symbol)
      .sort();
    const MAX_SYMBOLS_IN_ERROR = 8;
    const visibleSymbols = availableSymbols.slice(0, MAX_SYMBOLS_IN_ERROR);
    const hasMoreSymbols = availableSymbols.length > visibleSymbols.length;
    const available = hasMoreSymbols
      ? `${visibleSymbols.join(", ")} and more`
      : visibleSymbols.join(", ");
    throw new Error(
      `Unknown token: "${symbolOrAddress}". Available tokens: ${available}. ` +
        `Only pre-verified tokens are supported for safety. ` +
        `To add a custom token, update the StarkZap SDK token presets.`
    );
  };
}

export const addressSchema = z
  .string()
  .regex(FELT_REGEX, "Invalid Starknet address");

export function validateAddressOrThrow(
  address: string,
  label: string
): Address {
  if (!FELT_REGEX.test(address)) {
    throw new Error(
      `Invalid ${label} address: "${address}". Must be a hex string starting with 0x (1-64 hex chars).`
    );
  }
  try {
    return fromAddress(address);
  } catch (error) {
    throw new Error(
      `Invalid ${label} address: "${address}". ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export function validateAddressBatch(
  values: string[],
  label: string,
  pathPrefix: string
): Address[] {
  const normalized: Address[] = [];
  const errors: string[] = [];

  for (const [index, value] of values.entries()) {
    try {
      normalized.push(validateAddressOrThrow(value, label));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${pathPrefix}[${index}]: ${message}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Address validation failed: ${errors.join("; ")}`);
  }

  return normalized;
}

export const amountSchema = z
  .string()
  .max(32, "Amount string too long (max 32 chars)")
  .regex(/^\d+(\.\d+)?$/, "Amount must be a positive number")
  .refine((value) => Number(value) > 0, {
    message: "Amount must be greater than zero",
  });

const entrypointSchema = z
  .string()
  .max(64, "Entrypoint name too long (max 64 chars)")
  .regex(
    /^[a-zA-Z_][a-zA-Z0-9_]*$/,
    "Entrypoint must match Cairo identifier format"
  );

const calldataItemSchema = z
  .string()
  .max(256, "Calldata item too large (max 256 chars)")
  .regex(
    /^(0x[0-9a-fA-F]{1,64}|[0-9]+)$/,
    "Calldata must be a felt-like hex (0x...) or decimal string"
  );

const calldataSchema = z
  .array(calldataItemSchema)
  .max(2048, "Maximum 2048 calldata items per call")
  .optional();

// NOTE: Keep this map in sync with MCP tool inputSchema in buildTools().
// assertSchemaParity() runs at startup and in tests to prevent schema drift.
export const schemas = {
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
          entrypoint: entrypointSchema,
          calldata: calldataSchema,
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
          entrypoint: entrypointSchema,
          calldata: calldataSchema,
        })
      )
      .min(1)
      .max(10, "Maximum 10 calls per estimate batch"),
  }),
} as const;

export function buildTools(maxAmount: string, maxBatchAmount: string): Tool[] {
  return [
    {
      name: "x_get_balance",
      description:
        "Get the wallet's ERC20 token balance. Returns human-readable and raw values.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
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
        `Maximum ${maxAmount} tokens per individual transfer. ` +
        `Maximum ${maxBatchAmount} tokens total per transfer batch. ` +
        `Maximum 20 recipients per batch.`,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        type: "object" as const,
        properties: {
          token: {
            type: "string",
            description: "Token symbol or contract address",
          },
          transfers: {
            type: "array",
            minItems: 1,
            maxItems: 20,
            items: {
              type: "object",
              properties: {
                to: {
                  type: "string",
                  description: "Recipient address (0x...)",
                },
                amount: {
                  type: "string",
                  maxLength: 32,
                  pattern: "^\\d+(\\.\\d+)?$",
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
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        type: "object" as const,
        properties: {
          calls: {
            type: "array",
            minItems: 1,
            maxItems: 10,
            items: {
              type: "object",
              properties: {
                contractAddress: {
                  type: "string",
                  description: "Contract address",
                },
                entrypoint: {
                  type: "string",
                  maxLength: 64,
                  pattern: "^[a-zA-Z_][a-zA-Z0-9_]*$",
                  description: "Function name to call",
                },
                calldata: {
                  type: "array",
                  maxItems: 2048,
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
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
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
      description: `Enter a staking/delegation pool as a new member. Amount is parsed using the pool's canonical token decimals from chain metadata. Optional token hint must match the pool token. Maximum ${maxAmount} tokens per operation.`,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        type: "object" as const,
        properties: {
          pool: {
            type: "string",
            description: "Pool contract address",
          },
          amount: {
            type: "string",
            maxLength: 32,
            pattern: "^\\d+(\\.\\d+)?$",
            description: 'Amount to stake (e.g. "100")',
          },
          token: {
            type: "string",
            description:
              "Optional token hint (symbol/address). Must match the pool token.",
          },
        },
        required: ["pool", "amount"],
      },
    },
    {
      name: "x_add_to_pool",
      description: `Add more tokens to an existing stake in a pool. Amount is parsed using the pool's canonical token decimals from chain metadata. Optional token hint must match the pool token. Maximum ${maxAmount} tokens per operation.`,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        type: "object" as const,
        properties: {
          pool: {
            type: "string",
            description: "Pool contract address",
          },
          amount: {
            type: "string",
            maxLength: 32,
            pattern: "^\\d+(\\.\\d+)?$",
            description: "Amount to add",
          },
          token: {
            type: "string",
            description:
              "Optional token hint (symbol/address). Must match the pool token.",
          },
        },
        required: ["pool", "amount"],
      },
    },
    {
      name: "x_claim_rewards",
      description: "Claim accumulated staking rewards from a pool.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
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
      description: `Start the exit process from a pool. Amount is parsed using the pool's canonical token decimals from chain metadata. Optional token hint must match the pool token. Maximum ${maxAmount} tokens per operation. Tokens stop earning rewards immediately. Must wait for the exit window before calling x_exit_pool.`,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        type: "object" as const,
        properties: {
          pool: {
            type: "string",
            description: "Pool contract address",
          },
          amount: {
            type: "string",
            maxLength: 32,
            pattern: "^\\d+(\\.\\d+)?$",
            description: "Amount to unstake",
          },
          token: {
            type: "string",
            description:
              "Optional token hint (symbol/address). Must match the pool token.",
          },
        },
        required: ["pool", "amount"],
      },
    },
    {
      name: "x_exit_pool",
      description:
        "Complete the exit from a pool after the waiting period. Returns staked tokens to the wallet.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
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
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
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
        "Estimate the gas fee for one or more contract calls. Returns overall_fee and resource bounds (l1_gas, l2_gas, l1_data_gas). Maximum 10 calls per estimate batch.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: "object" as const,
        properties: {
          calls: {
            type: "array",
            minItems: 1,
            maxItems: 10,
            items: {
              type: "object",
              properties: {
                contractAddress: {
                  type: "string",
                  description: "Contract address",
                },
                entrypoint: {
                  type: "string",
                  maxLength: 64,
                  pattern: "^[a-zA-Z_][a-zA-Z0-9_]*$",
                  description: "Function name to call",
                },
                calldata: {
                  type: "array",
                  maxItems: 2048,
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
  ];
}

export const READ_ONLY_TOOLS = new Set([
  "x_get_balance",
  "x_get_pool_position",
  "x_estimate_fee",
]);

export const STAKING_TOOLS = new Set([
  "x_enter_pool",
  "x_add_to_pool",
  "x_claim_rewards",
  "x_exit_pool_intent",
  "x_exit_pool",
  "x_get_pool_position",
]);

export function selectTools(
  allTools: readonly Tool[],
  options: {
    enableWrite: boolean;
    enableExecute: boolean;
    stakingEnabled: boolean;
  }
): Tool[] {
  return allTools.filter((tool) => {
    if (!options.stakingEnabled && STAKING_TOOLS.has(tool.name)) {
      return false;
    }
    if (READ_ONLY_TOOLS.has(tool.name)) {
      return true;
    }
    if (tool.name === "x_execute") {
      return options.enableExecute;
    }
    return options.enableWrite;
  });
}

function requiredKeysFromZodSchema(schema: z.AnyZodObject): string[] {
  return Object.entries(schema.shape)
    .filter(([, field]) => !(field as z.ZodTypeAny).isOptional())
    .map(([key]) => key)
    .sort();
}

function unwrapZodType(type: z.ZodTypeAny): z.ZodTypeAny {
  let current = type;
  while (true) {
    if (current instanceof z.ZodOptional || current instanceof z.ZodNullable) {
      current = current.unwrap();
      continue;
    }
    if (current instanceof z.ZodDefault) {
      current = current._def.innerType;
      continue;
    }
    if (current instanceof z.ZodEffects) {
      current = current._def.schema;
      continue;
    }
    return current;
  }
}

function getArrayBounds(
  type: z.ZodTypeAny
): { min: number | null; max: number | null } | null {
  const unwrapped = unwrapZodType(type);
  if (!(unwrapped instanceof z.ZodArray)) {
    return null;
  }
  return {
    min: unwrapped._def.minLength?.value ?? null,
    max: unwrapped._def.maxLength?.value ?? null,
  };
}

export function schemaParityMismatches(tools: readonly Tool[]): string[] {
  const mismatches: string[] = [];
  const schemaEntries = Object.entries(schemas) as Array<
    [keyof typeof schemas, z.AnyZodObject]
  >;
  const toolByName = new Map(tools.map((tool) => [tool.name, tool]));

  for (const [name, schema] of schemaEntries) {
    const tool = toolByName.get(name);
    if (!tool) {
      mismatches.push(`Missing tool definition for schema "${name}"`);
      continue;
    }

    const inputSchema = tool.inputSchema as
      | {
          type?: string;
          properties?: Record<string, unknown>;
          required?: string[];
        }
      | undefined;

    if (!inputSchema || inputSchema.type !== "object") {
      mismatches.push(`Tool "${name}" inputSchema must be an object schema`);
      continue;
    }

    const zodKeys = Object.keys(schema.shape).sort();
    const inputKeys = Object.keys(inputSchema.properties ?? {}).sort();
    if (zodKeys.join(",") !== inputKeys.join(",")) {
      mismatches.push(
        `Tool "${name}" keys mismatch: zod=[${zodKeys.join(",")}], inputSchema=[${inputKeys.join(",")}]`
      );
    }

    const zodRequired = requiredKeysFromZodSchema(schema);
    const inputRequired = [...(inputSchema.required ?? [])].sort();
    if (zodRequired.join(",") !== inputRequired.join(",")) {
      mismatches.push(
        `Tool "${name}" required mismatch: zod=[${zodRequired.join(",")}], inputSchema=[${inputRequired.join(",")}]`
      );
    }

    for (const [fieldName, fieldSchema] of Object.entries(schema.shape)) {
      const bounds = getArrayBounds(fieldSchema as z.ZodTypeAny);
      if (!bounds) {
        continue;
      }

      const inputField = (inputSchema.properties ?? {})[fieldName] as
        | { minItems?: number; maxItems?: number }
        | undefined;
      const inputMin =
        typeof inputField?.minItems === "number" ? inputField.minItems : null;
      const inputMax =
        typeof inputField?.maxItems === "number" ? inputField.maxItems : null;

      if (inputMin !== bounds.min || inputMax !== bounds.max) {
        mismatches.push(
          `Tool "${name}" array bounds mismatch for "${fieldName}": zod=[min:${bounds.min},max:${bounds.max}], inputSchema=[min:${inputMin},max:${inputMax}]`
        );
      }
    }
  }

  for (const tool of tools) {
    if (!(tool.name in schemas)) {
      mismatches.push(`Tool "${tool.name}" has no matching runtime zod schema`);
    }
  }

  return mismatches;
}

export function assertSchemaParity(tools: readonly Tool[]): void {
  const mismatches = schemaParityMismatches(tools);
  if (mismatches.length > 0) {
    throw new Error(
      `Tool schema parity check failed:\n- ${mismatches.join("\n- ")}`
    );
  }
}

export function assertAmountWithinCap(
  amount: Amount,
  token: Token,
  cap: string | number
): void {
  const capLiteral = String(cap);
  const capAmount = Amount.parse(capLiteral, token);
  if (amount.gt(capAmount)) {
    throw new Error(
      `Amount ${amount.toUnit()} ${token.symbol} exceeds the per-operation cap of ${capLiteral}. ` +
        `Adjust --max-amount to increase the limit.`
    );
  }
}

export function assertBatchAmountWithinCap(
  amounts: Amount[],
  token: Token,
  cap: string | number
): void {
  const capLiteral = String(cap);
  const capAmount = Amount.parse(capLiteral, token);
  const total = amounts.reduce(
    (accumulator, amount) => {
      return accumulator.add(amount);
    },
    Amount.parse("0", token)
  );

  if (total.gt(capAmount)) {
    throw new Error(
      `Total batch amount ${total.toUnit()} ${token.symbol} exceeds the batch cap of ${capLiteral}. ` +
        `Adjust --max-batch-amount to increase the limit.`
    );
  }
}

export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTokenCandidate(value: unknown): value is Token {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.name === "string" &&
    typeof value.symbol === "string" &&
    typeof value.address === "string" &&
    FELT_REGEX.test(value.address) &&
    typeof value.decimals === "number" &&
    Number.isInteger(value.decimals) &&
    value.decimals >= 0
  );
}

const REQUIRED_STAKING_METHODS = [
  "enter",
  "add",
  "claimRewards",
  "exitIntent",
  "exit",
  "getPosition",
] as const;

export function assertStakingPoolShape(
  staking: unknown,
  poolAddress: Address
): void {
  if (!isRecord(staking)) {
    throw new Error(
      `Could not validate pool interface for ${poolAddress}: staking instance is not an object.`
    );
  }

  const missingMethods = REQUIRED_STAKING_METHODS.filter((methodName) => {
    return typeof staking[methodName] !== "function";
  });
  if (missingMethods.length > 0) {
    throw new Error(
      `Could not validate pool interface for ${poolAddress}: missing methods ${missingMethods.join(", ")}.`
    );
  }

  const declaredPoolAddress = staking.poolAddress;
  if (typeof declaredPoolAddress === "string") {
    if (
      normalizeStarknetAddress(declaredPoolAddress) !==
      normalizeStarknetAddress(poolAddress)
    ) {
      throw new Error(
        `Could not validate pool interface for ${poolAddress}: staking instance resolved to ${declaredPoolAddress}.`
      );
    }
  }
}

export function extractPoolToken(staking: unknown): Token | undefined {
  if (!isRecord(staking)) {
    return undefined;
  }

  const candidates: Array<unknown> = [
    staking.poolToken,
    staking.tokenConfig,
    staking.token,
  ];

  for (const candidate of candidates) {
    if (isTokenCandidate(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

export function assertPoolTokenHintMatches(
  poolToken: Token,
  tokenHint: string | undefined,
  resolveToken: (symbolOrAddress: string) => Token
): void {
  if (!tokenHint) {
    return;
  }
  const hintedToken = resolveToken(tokenHint);
  if (
    normalizeStarknetAddress(hintedToken.address) !==
    normalizeStarknetAddress(poolToken.address)
  ) {
    throw new Error(
      `Token hint "${tokenHint}" does not match pool token ${poolToken.symbol} (${poolToken.address}).`
    );
  }
}

export function isClassHashNotFoundError(error: unknown): boolean {
  const normalizedCode = (() => {
    if (!isRecord(error) || error.code === undefined || error.code === null) {
      return "";
    }
    return String(error.code).toLowerCase();
  })();

  const explicitNotFoundCodes = new Set([
    "contract_not_found",
    "starknet_error_contract_not_found",
    "20",
  ]);
  if (explicitNotFoundCodes.has(normalizedCode)) {
    return true;
  }

  const messages: string[] = [];
  if (error instanceof Error) {
    messages.push(error.message);
  }
  if (isRecord(error)) {
    if (typeof error.message === "string") {
      messages.push(error.message);
    }
    if (typeof error.data === "string") {
      messages.push(error.data);
    }
    if (isRecord(error.data) && typeof error.data.message === "string") {
      messages.push(error.data.message);
    }
    if (error.cause instanceof Error) {
      messages.push(error.cause.message);
    }
  }

  return messages.some((message) => {
    const normalized = message.toLowerCase();
    const mentionsNotFound =
      normalized.includes("not found") ||
      normalized.includes("is not deployed") ||
      normalized.includes("uninitialized contract");
    if (!mentionsNotFound) {
      return false;
    }
    return normalized.includes("contract") || normalized.includes("class hash");
  });
}

export function enforcePerMinuteRateLimit(
  bucket: number[],
  nowMs: number,
  maxPerMinute: number
): void {
  if (maxPerMinute <= 0) {
    return;
  }

  const windowStart = nowMs - 60_000;
  while (bucket.length > 0 && bucket[0] <= windowStart) {
    bucket.shift();
  }

  const RATE_LIMIT_BUCKET_BUFFER = 32;
  const maxBucketSize = maxPerMinute + RATE_LIMIT_BUCKET_BUFFER;
  if (bucket.length > maxBucketSize) {
    bucket.splice(0, bucket.length - maxBucketSize);
  }

  if (bucket.length >= maxPerMinute) {
    throw new Error(
      `Rate limit exceeded: maximum ${maxPerMinute} tool calls per minute.`
    );
  }

  bucket.push(nowMs);
}

function safeJson(value: unknown): string {
  return JSON.stringify(
    value,
    (_, current) =>
      typeof current === "bigint" ? current.toString() : current,
    2
  );
}

export function requireResourceBounds(fee: unknown): {
  l1_gas: { max_amount: bigint; max_price_per_unit: bigint };
  l2_gas: { max_amount: bigint; max_price_per_unit: bigint };
  l1_data_gas: { max_amount: bigint; max_price_per_unit: bigint };
} {
  const maybeFee = fee as {
    resourceBounds?: {
      l1_gas?: { max_amount: bigint; max_price_per_unit: bigint };
      l2_gas?: { max_amount: bigint; max_price_per_unit: bigint };
      l1_data_gas?: { max_amount: bigint; max_price_per_unit: bigint };
    };
  };

  const bounds = maybeFee.resourceBounds;
  if (!bounds?.l1_gas || !bounds.l2_gas || !bounds.l1_data_gas) {
    throw new Error(
      `Fee estimate response missing resourceBounds (l1_gas/l2_gas/l1_data_gas). Response: ${safeJson(fee)}`
    );
  }
  return bounds as {
    l1_gas: { max_amount: bigint; max_price_per_unit: bigint };
    l2_gas: { max_amount: bigint; max_price_per_unit: bigint };
    l1_data_gas: { max_amount: bigint; max_price_per_unit: bigint };
  };
}
