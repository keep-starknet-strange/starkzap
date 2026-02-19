import { CairoFelt252, Contract, RpcProvider } from "starknet";
import { type Address, type ChainId, getChainId, type Token } from "@/types";
import { groupBy } from "@/utils";
import { mainnetTokens } from "@/erc20/token/presets";
import { sepoliaTokens } from "@/erc20/token/presets.sepolia";
import { ABI as ERC20_ABI } from "@/abi/erc20";

export * from "@/erc20/token/presets";
export * from "@/erc20/token/presets.sepolia";

export function getPresets(chainId: ChainId): Record<string, Token> {
  if (chainId.isMainnet()) return mainnetTokens;
  if (chainId.isSepolia()) return sepoliaTokens;
  return {};
}

const MAX_PARALLEL_TOKEN_REQUESTS = 8;
const MAX_TOKEN_NAME_LENGTH = 128;
const MAX_TOKEN_SYMBOL_LENGTH = 32;
const MAX_TOKEN_DECIMALS = 255n;

function sanitizeTokenText(input: string, maxLength: number): string {
  const clean = Array.from(input)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 0x20 && code !== 0x7f;
    })
    .join("")
    .trim();
  return clean.slice(0, maxLength);
}

function parseTokenDecimals(decimals: unknown): number {
  let asBigInt: bigint;
  try {
    asBigInt = BigInt(decimals as string | number | bigint);
  } catch {
    throw new Error(`Invalid token decimals value: ${String(decimals)}`);
  }
  if (asBigInt < 0n) {
    throw new Error("Token decimals cannot be negative");
  }
  if (asBigInt > MAX_TOKEN_DECIMALS) {
    throw new Error(`Token decimals too large: ${asBigInt.toString()}`);
  }
  return Number(asBigInt);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let index = 0;

  const worker = async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      const item = items[current];
      if (item === undefined) {
        continue;
      }
      results[current] = await mapper(item);
    }
  };

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

async function resolveUnknownToken(
  address: Address,
  provider: RpcProvider
): Promise<Token | null> {
  const contract = new Contract({
    abi: ERC20_ABI,
    address: address,
    providerOrAccount: provider,
  }).typedv2(ERC20_ABI);

  try {
    const [rawName, rawSymbol, rawDecimals] = await Promise.all([
      contract.name(),
      contract.symbol(),
      contract.decimals(),
    ]);

    const name = sanitizeTokenText(
      new CairoFelt252(rawName).decodeUtf8(),
      MAX_TOKEN_NAME_LENGTH
    );
    const symbol = sanitizeTokenText(
      new CairoFelt252(rawSymbol).decodeUtf8(),
      MAX_TOKEN_SYMBOL_LENGTH
    );
    const decimals = parseTokenDecimals(rawDecimals);

    if (!name || !symbol) {
      throw new Error("Token metadata returned empty name or symbol");
    }

    return {
      name,
      address,
      decimals,
      symbol,
    };
  } catch (error) {
    console.warn(
      `Could not determine token ${address}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
}

export async function getTokensFromAddresses(
  tokenAddresses: Address[],
  provider: RpcProvider
): Promise<Token[]> {
  const chainId = await getChainId(provider);
  const presetTokens = Object.values(getPresets(chainId));

  const tokens: Token[] = [];
  const unknownTokenAddresses: Address[] = [];
  const presetByAddress = groupBy(presetTokens, (preset) => preset.address);

  for (const tokenAddress of tokenAddresses) {
    const token = presetByAddress.get(tokenAddress)?.[0];

    if (token) {
      tokens.push(token);
    } else {
      unknownTokenAddresses.push(tokenAddress);
    }
  }

  if (unknownTokenAddresses.length > 0) {
    const resolvedUnknownTokens = await mapWithConcurrency(
      unknownTokenAddresses,
      MAX_PARALLEL_TOKEN_REQUESTS,
      async (address) => resolveUnknownToken(address, provider)
    );
    tokens.push(
      ...resolvedUnknownTokens.filter((token): token is Token => token !== null)
    );
  }

  return tokens;
}
