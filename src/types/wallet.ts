import type { Call, Calldata, PaymasterTimeBounds } from "starknet";
import type { SignerInterface } from "@/signer/interface";
import type { SwapProvider } from "@/swap/interface";
import type { DcaProvider } from "@/dca/interface";
import type { Address } from "@/types/address";

// ─── Account Class Configuration ─────────────────────────────────────────────

/**
 * Configuration for an account contract class.
 * Use presets like `OpenZeppelinPreset` or define your own.
 *
 * @example
 * ```ts
 * // Use a preset
 * import { OpenZeppelinPreset } from "starkzap";
 * { accountClass: OpenZeppelinPreset }
 *
 * // Or define custom
 * {
 *   accountClass: {
 *     classHash: "0x...",
 *     buildConstructorCalldata: (pk) => [pk, "0x0"],
 *   }
 * }
 * ```
 */
export interface AccountClassConfig {
  /** Account contract class hash */
  classHash: string;
  /** Build constructor calldata from public key */
  buildConstructorCalldata: (publicKey: string) => Calldata;
  /**
   * Compute the salt for address computation.
   * Default: uses public key directly (for Stark curve accounts).
   * Override for non-Stark curves (e.g., P-256/WebAuthn) where the public key
   * is too large for Pedersen hash.
   */
  getSalt?: (publicKey: string) => string;
}

// ─── Account Configuration ──────────────────────────────────────────────────

/**
 * Full account configuration for connecting a wallet.
 *
 * @example
 * ```ts
 * import { StarkSigner, OpenZeppelinPreset } from "starkzap";
 *
 * {
 *   signer: new StarkSigner(privateKey),
 *   accountClass: OpenZeppelinPreset, // optional, defaults to OpenZeppelin
 * }
 * ```
 */
export interface AccountConfig {
  /** Signer for transaction signing */
  signer: SignerInterface;
  /** Account class configuration (default: OpenZeppelin) */
  accountClass?: AccountClassConfig;
}

// ─── Fee Mode ────────────────────────────────────────────────────────────────

/**
 * How transaction fees are paid.
 *
 * - `"user_pays"` — User's account pays gas in ETH/STRK
 * - `{ type: "paymaster" }` — Paymaster covers gas (sponsored)
 * - `{ type: "paymaster", gasToken: "0x..." }` — Pay gas via ERC-20 through paymaster
 * - `"sponsored"` — *(deprecated)* Alias for `{ type: "paymaster" }`
 */
export type FeeMode =
  | "user_pays"
  | { type: "paymaster"; gasToken?: Address }
  | DeprecatedSponsoredFeeMode;

/**
 * @deprecated Use `{ type: "paymaster" }` instead.
 */
type DeprecatedSponsoredFeeMode = "sponsored";

// ─── Provider Options ────────────────────────────────────────────────────────

/**
 * Shared provider registration options.
 *
 * Used by `connectWallet()`, `onboard()`, and `WalletOptions` to register
 * swap and DCA providers on the wallet at creation time.
 */
export interface ProviderOptions {
  /** Optional additional swap providers to register on the wallet */
  swapProviders?: SwapProvider[];
  /** Optional default swap provider id (must be registered) */
  defaultSwapProviderId?: string;
  /** Optional additional DCA providers to register on the wallet */
  dcaProviders?: DcaProvider[];
  /** Optional default DCA provider id (must be registered) */
  defaultDcaProviderId?: string;
}

// ─── Connect Options ─────────────────────────────────────────────────────────

/**
 * Options for `sdk.connectWallet()`.
 *
 * @example
 * ```ts
 * import { StarkSigner, ArgentPreset } from "starkzap";
 *
 * // User pays fees
 * await sdk.connectWallet({
 *   account: {
 *     signer: new StarkSigner(privateKey),
 *     accountClass: ArgentPreset,
 *   },
 * });
 *
 * // Sponsored via AVNU paymaster
 * await sdk.connectWallet({
 *   account: { signer: new StarkSigner(privateKey) },
 *   feeMode: { type: "paymaster" },
 * });
 * ```
 */
export interface ConnectWalletOptions extends ProviderOptions {
  /** Account configuration */
  account: AccountConfig;
  /** Optional known account address (skips SDK address derivation) */
  accountAddress?: Address;
  /** How fees are paid (default: "user_pays") */
  feeMode?: FeeMode;
  /** Optional time bounds for paymaster transactions */
  timeBounds?: PaymasterTimeBounds;
}

// ─── Ensure Ready ────────────────────────────────────────────────────────────

/**
 * When to deploy the account contract.
 * - `"never"`: Don't deploy, fail if not deployed
 * - `"if_needed"`: Deploy only if not already deployed
 * - `"always"`: Always attempt deployment
 */
export type DeployMode = "never" | "if_needed" | "always";

/** Progress steps during `wallet.ensureReady()` */
export type ProgressStep =
  | "CONNECTED"
  | "CHECK_DEPLOYED"
  | "DEPLOYING"
  | "FAILED"
  | "READY";

/** Progress event emitted during `wallet.ensureReady()` */
export interface ProgressEvent {
  step: ProgressStep;
}

/**
 * Options for `wallet.ensureReady()`.
 *
 * @example
 * ```ts
 * await wallet.ensureReady({
 *   deploy: "if_needed",
 *   feeMode: { type: "paymaster" },
 *   onProgress: (e) => console.log(e.step)
 * });
 * ```
 */
export interface EnsureReadyOptions {
  /** When to deploy (default: "if_needed") */
  deploy?: DeployMode;
  /** How to pay for deployment if needed (default: wallet's default) */
  feeMode?: FeeMode;
  /** Callback for progress updates */
  onProgress?: (event: ProgressEvent) => void;
}

// ─── Transaction Fee Options ─────────────────────────────────────────────────

/** Common fee options shared by deploy and execute operations. */
interface TransactionFeeOptions {
  /** How fees are paid (default: "user_pays") */
  feeMode?: FeeMode;
  /** Optional time bounds for paymaster transactions */
  timeBounds?: PaymasterTimeBounds;
}

// ─── Deploy ──────────────────────────────────────────────────────────────────

/** Options for `wallet.deploy()` */
export type DeployOptions = TransactionFeeOptions;

// ─── Execute ─────────────────────────────────────────────────────────────────

/** Options for `wallet.execute()` */
export type ExecuteOptions = TransactionFeeOptions;

// ─── Preflight ───────────────────────────────────────────────────────────────

/**
 * Options for `wallet.preflight()`.
 * Checks if an operation can succeed before attempting it.
 */
export interface PreflightOptions {
  /** The calls to simulate */
  calls: Call[];
  /**
   * Fee mode used for preflight assumptions.
   *
   * When using a paymaster mode (`{ type: "paymaster" }` — with or without
   * `gasToken`) and the account is undeployed, preflight returns `{ ok: true }`
   * because the paymaster path can deploy + execute atomically.
   *
   * The `gasToken` field only affects which token is used for fee payment;
   * it does not change the preflight deployment decision.
   */
  feeMode?: FeeMode;
}

/** Preflight succeeded — operation can proceed */
export interface PreflightResultOk {
  ok: true;
}

/** Preflight failed — operation would fail */
export interface PreflightResultError {
  ok: false;
  /** Human-readable reason why it would fail */
  reason: string;
}

/** Result of a preflight check */
export type PreflightResult = PreflightResultOk | PreflightResultError;
