// noinspection ES6PreferShortImport

/**
 * Fetches ERC20 tokens from Voyager API and generates TypeScript presets.
 *
 * Usage:
 *   npm run generate:presets
 *   npm run generate:presets:sepolia
 *
 * Options:
 *   --network    (mainnet or sepolia) Network to fetch tokens for.
 *   --limit      Maximum number of tokens to fetch (default: 400 for mainnet, 200 for sepolia)
 *
 * Arguments:
 *   output-path  Path to output TypeScript file (default: src/token/presets.ts)
 *
 * Requires:
 *   VOYAGER_API_KEY in .env file or as environment variable
 */

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { Address } from "../src/types/address.js";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

const VOYAGER_API_URLS = {
  mainnet: "https://api.voyager.online/beta/tokens",
  sepolia: "https://sepolia-api.voyager.online/beta/tokens",
} as const;

type Network = keyof typeof VOYAGER_API_URLS;

const DEFAULT_OUTPUT_PATHS: Record<Network, string> = {
  mainnet: resolve(__dirname, "../src/token/presets.ts"),
  sepolia: resolve(__dirname, "../src/token/presets.sepolia.ts"),
};

const DEFAULT_LIMITS: Record<Network, number> = {
  mainnet: 400,
  sepolia: 200,
};

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    network: { type: "string", short: "n" },
    limit: { type: "string", short: "l" },
  },
});

const network = values.network as Network | undefined;

function getLimit(): number {
  if (values.limit) {
    const parsed = parseInt(values.limit, 10);
    if (isNaN(parsed) || parsed <= 0) {
      console.error("Error: --limit must be a positive number");
      process.exit(1);
    }
    return parsed;
  }
  if (network && network in DEFAULT_LIMITS) {
    return DEFAULT_LIMITS[network];
  }
  return DEFAULT_LIMITS.mainnet;
}

function getOutputPath(): string {
  if (positionals[0]) {
    return resolve(positionals[0]);
  }
  if (network && network in DEFAULT_OUTPUT_PATHS) {
    return DEFAULT_OUTPUT_PATHS[network];
  }
  return DEFAULT_OUTPUT_PATHS.mainnet;
}

interface VoyagerToken {
  address: string;
  decimals: string;
  holders: string;
  name: string;
  symbol: string;
  transfers: string;
  type: "erc20" | "erc721" | "erc1155";
}

interface VoyagerResponse {
  items: VoyagerToken[];
  lastPage: number;
}

interface Token {
  name: string;
  address: Address;
  decimals: number;
  symbol: string;
}

async function fetchPage(
  page: number,
  apiKey: string,
  apiUrl: string
): Promise<VoyagerResponse> {
  const url = new URL(apiUrl);
  url.searchParams.set("type", "erc20");
  url.searchParams.set("attribute", "holders");
  url.searchParams.set("p", page.toString());
  url.searchParams.set("ps", "100");

  const response = await fetch(url.toString(), {
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      "Voyager API error: " + response.status + " " + response.statusText
    );
  }

  return response.json() as Promise<VoyagerResponse>;
}

function transformToken(voyagerToken: VoyagerToken): Token {
  return {
    name: voyagerToken.name,
    address: Address.from(voyagerToken.address),
    decimals: parseInt(voyagerToken.decimals, 10),
    symbol: voyagerToken.symbol,
  };
}

async function fetchAllTokens(
  apiKey: string,
  apiUrl: string,
  limit: number
): Promise<Token[]> {
  const tokens: Token[] = [];
  let page = 1;
  let lastPage = 1;

  console.log(
    "Fetching up to " + limit + " ERC20 tokens from " + apiUrl + "..."
  );

  do {
    const pageInfo = lastPage > 1 ? page + "/" + lastPage : page + "/...";
    console.log("  Fetching page " + pageInfo);
    const response = await fetchPage(page, apiKey, apiUrl);
    lastPage = response.lastPage;

    for (const item of response.items) {
      tokens.push(transformToken(item));
      if (tokens.length >= limit) {
        console.log("  Reached limit of " + limit + " tokens");
        return tokens;
      }
    }

    page++;
  } while (page <= lastPage);

  return tokens;
}

/**
 * Convert a token symbol to a valid TypeScript key name.
 */
function toKeyName(symbol: string): string {
  let name = symbol
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .toUpperCase();

  // Prefix with underscore if starts with a number
  if (/^[0-9]/.test(name)) {
    name = "_" + name;
  }

  // Fallback for empty names
  if (!name) {
    name = "UNKNOWN";
  }

  return name;
}

/**
 * Escape a string for use in TypeScript source code.
 */
function escapeString(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

/**
 * Generate TypeScript presets file content for a specific network.
 */
function generatePresets(tokens: Token[], networkName: Network): string {
  const subdomain = networkName === "sepolia" ? "sepolia." : "";
  const lines: string[] = [
    "/**",
    ` * ERC20 token presets for Starknet ${networkName}.`,
    " *",
    " * AUTO-GENERATED FILE - DO NOT EDIT MANUALLY",
    ` * Generated by: npx tsx scripts/generate-presets.ts --network ${networkName}`,
    ` * Source: Voyager API (https://${subdomain}voyager.online)`,
    " */",
    "",
    'import type { Token } from "../types/token.js";',
    'import type { Address } from "../types/address.js";',
    "",
    `export const ${networkName}Tokens: Record<string, Token> = {`,
  ];

  // Track used key names to handle duplicates
  const usedNames = new Map<string, number>();

  for (const token of tokens) {
    let keyName = toKeyName(token.symbol);

    // Handle duplicate key names
    const count = usedNames.get(keyName) ?? 0;
    if (count > 0) {
      keyName = keyName + "_" + count;
    }
    usedNames.set(toKeyName(token.symbol), count + 1);

    lines.push(`  /** ${escapeString(token.name)} */`);
    lines.push(`  ${keyName}: {`);
    lines.push(`    name: "${escapeString(token.name)}",`);
    lines.push(`    address: "${token.address}" as Address,`);
    lines.push(`    decimals: ${token.decimals},`);
    lines.push(`    symbol: "${escapeString(token.symbol)}",`);
    lines.push("  },");
  }

  lines.push("};");
  lines.push("");

  return lines.join("\n");
}

async function main() {
  if (!network || !["mainnet", "sepolia"].includes(network)) {
    console.error("Error: --network flag is required (mainnet or sepolia)");
    console.error(
      "Usage: npx tsx scripts/generate-presets.ts --network <network>"
    );
    process.exit(1);
  }

  const apiKey = process.env.VOYAGER_API_KEY;

  if (!apiKey) {
    console.error("Error: VOYAGER_API_KEY environment variable is required");
    console.error("Set it in .env or pass it directly:");
    console.error(
      "  VOYAGER_API_KEY=xxx npx tsx scripts/generate-presets.ts --network " +
        network
    );
    process.exit(1);
  }

  const apiUrl = VOYAGER_API_URLS[network];
  const limit = getLimit();

  try {
    const tokens = await fetchAllTokens(apiKey, apiUrl, limit);

    console.log("\nFetched " + tokens.length + " ERC20 tokens for " + network);

    const presetsContent = generatePresets(tokens, network);
    const outputPath = getOutputPath();
    writeFileSync(outputPath, presetsContent);

    console.log(`Written presets to ${outputPath}`);
  } catch (error) {
    console.error("Failed to generate presets:", error);
    process.exit(1);
  }
}

main();
