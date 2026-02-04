// noinspection ES6PreferShortImport

/**
 * Fetches staking validators from Voyager API and generates TypeScript presets.
 *
 * Usage:
 *   npm run generate:validators
 *   npm run generate:validators:sepolia
 *
 * Options:
 *   --network    (mainnet or sepolia) Network to fetch validators for.
 *
 * API Documentation: https://voyager.online/docs/api/staking/validators
 *
 * Requires VOYAGER_API_KEY environment variable to be set.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { fromAddress, type Validator } from "@/types";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

const VOYAGER_API_URLS = {
  mainnet: "https://api.voyager.online/beta/staking/validators",
  sepolia: "https://sepolia-api.voyager.online/beta/staking/validators",
} as const;

type Network = keyof typeof VOYAGER_API_URLS;

const DEFAULT_OUTPUT_PATHS: Record<Network, string> = {
  mainnet: resolve(__dirname, "../src/staking/validator/presets.ts"),
  sepolia: resolve(__dirname, "../src/staking/validator/presets.sepolia.ts"),
};

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    network: { type: "string", short: "n" },
  },
});

const network = values.network as Network | undefined;

function getOutputPath(): string {
  if (positionals[0]) {
    return resolve(positionals[0]);
  }
  if (network && network in DEFAULT_OUTPUT_PATHS) {
    return DEFAULT_OUTPUT_PATHS[network];
  }
  return DEFAULT_OUTPUT_PATHS.mainnet;
}

function getApiKey(): string {
  const apiKey = process.env.VOYAGER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "VOYAGER_API_KEY environment variable is required.\n" +
        "Get your API key at https://voyager.online/docs/api/getting-started"
    );
  }
  return apiKey;
}

interface VoyagerPoolInfo {
  tokenAddress: string | null;
  poolContract: string | null;
  tokenInfo: {
    tokenAddress: string;
    price: number;
    decimals: number;
    logoUrl: string;
    name: string;
    symbol: string;
  } | null;
}

interface VoyagerValidator {
  stakerState: string;
  address: string;
  isVerified: boolean;
  totalStakeStrk: string;
  totalStakeBtc: string;
  totalStakePercentageStrk: number;
  totalStakePercentageBtc: number;
  totalSelfStake: string;
  totalDelegatedStakeStrk: string;
  totalDelegatedStakeBtc: string;
  totalDelegators: number;
  revenueShare: number;
  aprStrk: number;
  aprBtc: number;
  rank: string;
  name: string | null;
  imgSrc: string | null;
  startTime: number;
  stakerAddress: string;
  liveness: number;
  livenessAttestedEpochs: number;
  livenessTotalEpochs: number;
  livenessLastEpoch: number;
  poolInfos: VoyagerPoolInfo[];
  stakingPowerStrk: number;
  stakingPowerBtc: number;
  stakingPower: number;
}

interface VoyagerResponse {
  items: VoyagerValidator[];
  pagination: {
    prev: string | null;
    next: string | null;
    totalPages: number;
    pageSize: number;
    prevPage: number | null;
    nextPage: number | null;
    currentPage: number;
  };
}

async function fetchPage(
  page: number,
  apiUrl: string,
  apiKey: string
): Promise<VoyagerResponse> {
  const url = new URL(apiUrl);
  url.searchParams.set("p", page.toString());
  url.searchParams.set("ps", "100");
  url.searchParams.set("sortBy", "rank");
  url.searchParams.set("sortOrder", "ASC");

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

function hasValidPools(voyagerValidator: VoyagerValidator): boolean {
  return voyagerValidator.poolInfos.some(
    (pool) => pool.tokenAddress && pool.poolContract && pool.tokenInfo?.symbol
  );
}

function transformValidator(voyagerValidator: VoyagerValidator): Validator {
  return {
    name: voyagerValidator.name || `Validator #${voyagerValidator.rank}`,
    stakerAddress: fromAddress(voyagerValidator.stakerAddress),
    logoUrl: voyagerValidator.imgSrc ? new URL(voyagerValidator.imgSrc) : null,
  };
}

async function fetchAllValidators(
  apiUrl: string,
  apiKey: string
): Promise<Validator[]> {
  const validators: Validator[] = [];
  let page = 1;
  let totalPages = 1;

  console.log(
    "Fetching staking validators from Voyager API (" + apiUrl + ")..."
  );

  do {
    const pageInfo = totalPages > 1 ? page + "/" + totalPages : page + "/...";
    console.log("  Fetching page " + pageInfo);
    const response = await fetchPage(page, apiUrl, apiKey);
    totalPages = response.pagination.totalPages;

    for (const item of response.items) {
      // Only include active, verified validators with valid staker addresses and pools
      if (
        item.stakerState === "active" &&
        item.stakerAddress &&
        item.isVerified &&
        hasValidPools(item)
      ) {
        validators.push(transformValidator(item));
      }
    }

    page++;
  } while (page <= totalPages);

  return validators;
}

/**
 * Convert a validator name to a valid TypeScript key name.
 */
function toKeyName(name: string): string {
  let key = name
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .toUpperCase();

  // Prefix with underscore if starts with a number
  if (/^[0-9]/.test(key)) {
    key = "_" + key;
  }

  // Fallback for empty names
  if (!key) {
    key = "UNKNOWN";
  }

  return key;
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
function generatePresets(
  validators: Validator[],
  networkName: Network
): string {
  const subdomain = networkName === "sepolia" ? "sepolia." : "";
  const lines: string[] = [
    "/**",
    ` * Staking validator presets for Starknet ${networkName}.`,
    " *",
    " * AUTO-GENERATED FILE - DO NOT EDIT MANUALLY",
    ` * Generated by: npx tsx scripts/generate-validator-presets.ts --network ${networkName}`,
    ` * Source: Voyager API (https://${subdomain}api.voyager.online)`,
    " */",
    "",
    'import type { Address, Validator } from "@/types";',
    "",
    `export const ${networkName}Validators: Record<string, Validator> = {`,
  ];

  // Track used key names to handle duplicates
  const usedNames = new Map<string, number>();

  for (const validator of validators) {
    let keyName = toKeyName(validator.name);

    // Handle duplicate key names
    const count = usedNames.get(keyName) ?? 0;
    if (count > 0) {
      keyName = keyName + "_" + count;
    }
    usedNames.set(toKeyName(validator.name), count + 1);

    lines.push(`  ${keyName}: {`);
    lines.push(`    name: "${escapeString(validator.name)}",`);
    lines.push(`    stakerAddress: "${validator.stakerAddress}" as Address,`);
    if (validator.logoUrl) {
      lines.push(
        `    logoUrl: new URL("${escapeString(validator.logoUrl.toString())}"),`
      );
    } else {
      lines.push(`    logoUrl: null,`);
    }
    lines.push("  },");
  }

  lines.push("} as const;");
  lines.push("");

  return lines.join("\n");
}

async function main() {
  if (!network || !["mainnet", "sepolia"].includes(network)) {
    console.error("Error: --network flag is required (mainnet or sepolia)");
    console.error(
      "Usage: npx tsx scripts/generate-validator-presets.ts --network <network>"
    );
    process.exit(1);
  }

  const apiKey = getApiKey();
  const apiUrl = VOYAGER_API_URLS[network];

  try {
    const validators = await fetchAllValidators(apiUrl, apiKey);

    console.log(
      "\nFetched " + validators.length + " verified validators for " + network
    );

    const presetsContent = generatePresets(validators, network);
    const outputPath = getOutputPath();

    // Ensure directory exists
    mkdirSync(dirname(outputPath), { recursive: true });

    writeFileSync(outputPath, presetsContent);

    console.log(`Written presets to ${outputPath}`);
  } catch (error) {
    console.error("Failed to generate validator presets:", error);
    process.exit(1);
  }
}

main();
