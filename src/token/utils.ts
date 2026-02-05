import type { Token } from "@/types";
import type { ChainId } from "@/types/config";
import type { NetworkName } from "@/network";
import { Erc20 } from "@/erc20";
import { mainnetTokens } from "./presets";
import { sepoliaTokens } from "./presets.sepolia";

/**
 * Token presets indexed by chain ID.
 */
const tokensByChain: Record<ChainId, Record<string, Token>> = {
  SN_MAIN: mainnetTokens,
  SN_SEPOLIA: sepoliaTokens,
};

/**
 * Network name to chain ID mapping.
 */
const networkToChainId: Record<NetworkName, ChainId> = {
  mainnet: "SN_MAIN",
  sepolia: "SN_SEPOLIA",
  devnet: "SN_SEPOLIA", // Devnet uses Sepolia tokens
};

/**
 * Get all token presets for a specific network.
 *
 * @param network - Chain ID ("SN_MAIN", "SN_SEPOLIA") or network name ("mainnet", "sepolia")
 * @returns Token presets for the specified network
 *
 * @example
 * ```ts
 * import { getTokens } from "x";
 *
 * // Using chain ID
 * const tokens = getTokens("SN_SEPOLIA");
 * const strk = tokens.STRK;
 *
 * // Using network name
 * const tokens = getTokens("mainnet");
 * const eth = tokens.ETH;
 * ```
 */
export function getTokens(
  network: ChainId | NetworkName
): Record<string, Token> {
  // Check if it's a network name
  if (network in networkToChainId) {
    return tokensByChain[networkToChainId[network as NetworkName]];
  }

  // Must be a chain ID
  const tokens = tokensByChain[network as ChainId];
  if (!tokens) {
    throw new Error(
      `Unknown network: ${network}. Use "SN_MAIN", "SN_SEPOLIA", "mainnet", or "sepolia".`
    );
  }

  return tokens;
}

/**
 * Get a specific token by symbol for a network.
 *
 * @param symbol - Token symbol (e.g., "ETH", "STRK", "USDC")
 * @param network - Chain ID or network name (default: "SN_SEPOLIA")
 * @returns The token configuration
 * @throws Error if token not found
 *
 * @example
 * ```ts
 * import { getToken, Erc20 } from "x";
 *
 * // Get STRK on Sepolia
 * const strk = getToken("STRK", "sepolia");
 *
 * // Get ETH on Mainnet
 * const eth = getToken("ETH", "mainnet");
 *
 * // Use with Erc20 class
 * const strkContract = new Erc20(getToken("STRK", chainId));
 * ```
 */
export function getToken(
  symbol: string,
  network: ChainId | NetworkName = "SN_SEPOLIA"
): Token {
  const tokens = getTokens(network);
  const token = tokens[symbol];

  if (!token) {
    const available = Object.keys(tokens).slice(0, 10).join(", ");
    throw new Error(
      `Token "${symbol}" not found on ${network}. Available: ${available}...`
    );
  }

  return token;
}

/**
 * Get an Erc20 contract instance for a token by symbol.
 *
 * @param symbol - Token symbol (e.g., "ETH", "STRK", "USDC")
 * @param network - Chain ID or network name (default: "SN_SEPOLIA")
 * @returns Erc20 contract instance ready to use
 *
 * @example
 * ```ts
 * import { getErc20, Amount } from "x";
 *
 * // Get STRK contract on Sepolia
 * const strk = getErc20("STRK", "sepolia");
 *
 * // Check balance
 * const balance = await strk.balanceOf(wallet);
 *
 * // Transfer tokens
 * const tx = await strk.transfer({
 *   from: wallet,
 *   transfers: [{ to: recipient, amount: Amount.parse("10", strk.token) }],
 * });
 * ```
 */
export function getErc20(
  symbol: string,
  network: ChainId | NetworkName = "SN_SEPOLIA"
): Erc20 {
  return new Erc20(getToken(symbol, network));
}
