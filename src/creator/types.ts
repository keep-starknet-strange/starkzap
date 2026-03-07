import type { Address, Token, Amount } from "@/types";
import type { WalletInterface } from "@/wallet";

/**
 * Creator profile configuration.
 */
export interface CreatorConfig {
  /** Starknet address of the creator */
  address: Address;
  /** Display name for the creator */
  displayName?: string;
  /** Supported tokens for tips (defaults to STRK, ETH, USDC if not specified) */
  tokens?: Token[];
  /** Creator's profile image URL */
  avatarUrl?: string;
  /** Creator's bio/description */
  bio?: string;
}

/**
 * Tip options.
 */
export interface TipOptions {
  /** Amount to tip */
  amount: Amount;
  /** Optional message with the tip */
  message?: string;
  /** Wallet to send the tip from */
  from: WalletInterface;
}

/**
 * Tip result.
 */
export interface TipResult {
  /** Transaction hash */
  txHash: string;
  /** Amount tipped */
  amount: Amount;
  /** Recipient address */
  recipient: Address;
  /** Timestamp of the tip */
  timestamp: Date;
}

/**
 * Tip link configuration.
 */
export interface TipLinkOptions {
  /** Suggested tip amount (in token units, not base units) */
  suggestedAmount?: string;
  /** Token for the tip */
  token?: Token;
  /** Optional message template */
  message?: string;
  /** Custom button text */
  buttonText?: string;
  /** Theme for the tip page */
  theme?: "light" | "dark";
}

/**
 * Tip link result.
 */
export interface TipLinkResult {
  /** Shareable URL for the tip page */
  url: string;
  /** QR code data URL (base64) */
  qrCodeDataUrl?: string;
}

/**
 * Tip button configuration for embedding.
 */
export interface TipButtonOptions {
  /** Creator address to tip */
  creator: Address;
  /** Predefined tip amounts (in token units) */
  suggestedTips?: string[];
  /** Token to use for tips */
  token?: Token;
  /** UI theme */
  theme?: "light" | "dark" | "auto";
  /** Custom button text */
  buttonText?: string;
  /** Show custom amount input */
  allowCustomAmount?: boolean;
  /** Callback when tip is sent successfully */
  onSuccess?: (result: TipResult) => void;
  /** Callback when tip fails */
  onError?: (error: Error) => void;
}

/**
 * Rendered tip button HTML.
 */
export interface TipButtonRenderResult {
  /** HTML string for the button */
  html: string;
  /** Script to inject for interactivity */
  script?: string;
  /** Styles to inject */
  styles?: string;
}

/**
 * Creator statistics.
 */
export interface CreatorStats {
  /** Total tips received (in base units per token) */
  totalTipsReceived: Record<string, bigint>;
  /** Number of unique tippers */
  uniqueTippers: number;
  /** Total tips count */
  totalTipsCount: number;
}

/**
 * Wallet or address union type for flexible input.
 */
export type WalletOrAddress = WalletInterface | Address;

/**
 * Helper to extract address from WalletOrAddress.
 */
export function getAddressFromWalletOrAddress(
  walletOrAddress: WalletOrAddress,
): Address {
  if (typeof walletOrAddress === "string") {
    return walletOrAddress;
  }
  return walletOrAddress.address;
}
