/**
 * ERC20 token configuration.
 *
 * @example
 * ```ts
 * // Use a preset
 * import { TBTC, USDC } from "x";
 * sdk.erc20({ token: TBTC });
 *
 * // Or define custom
 * sdk.erc20({
 *   token: {
 *     address: "0x...",
 *     decimals: 18,
 *     symbol: "MY_TOKEN",
 *   }
 * });
 * ```
 */
export interface Token {
  /** Contract address of the token */
  address: string;
  /** Number of decimal places (e.g., 18 for ETH, 6 for USDC, 8 for BTC) */
  decimals: number;
  /** Token symbol for display */
  symbol: string;
}
