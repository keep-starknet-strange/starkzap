import type { Token } from "../types/token.js";

// ─── BTC Wrappers ────────────────────────────────────────────────────────────

/**
 * tBTC on Starknet (Threshold Network)
 */
export const TBTC: Token = {
  address: "0x...", // TODO: Add actual address
  decimals: 8,
  symbol: "tBTC",
};

/**
 * wBTC on Starknet
 */
export const WBTC: Token = {
  address: "0x...", // TODO: Add actual address
  decimals: 8,
  symbol: "wBTC",
};

// ─── Stablecoins ─────────────────────────────────────────────────────────────

/**
 * USDC on Starknet
 */
export const USDC: Token = {
  address: "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
  decimals: 6,
  symbol: "USDC",
};

/**
 * USDT on Starknet
 */
export const USDT: Token = {
  address: "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8",
  decimals: 6,
  symbol: "USDT",
};

// ─── Native Tokens ───────────────────────────────────────────────────────────

/**
 * ETH on Starknet
 */
export const ETH: Token = {
  address: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
  decimals: 18,
  symbol: "ETH",
};

/**
 * STRK (Starknet token)
 */
export const STRK: Token = {
  address: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  decimals: 18,
  symbol: "STRK",
};
