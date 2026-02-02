import type { Call, Calldata, PaymasterTimeBounds } from "starknet";
import type { SignerInterface } from "../signer/interface.js";

// ─── Account Class Configuration ─────────────────────────────────────────────

/**
 * Configuration for an account contract class.
 * Use presets like `OpenZeppelinPreset` or define your own.
 *
 * @example
 * ```ts
 * // Use a preset
 * import { OpenZeppelinPreset } from "x";
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
 * import { StarkSigner, OpenZeppelinPreset } from "x";
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
 * - `"sponsored"`: Paymaster covers gas (requires SDK sponsor config)
 * - `"user_pays"`: User's account pays gas in ETH/STRK
 */
export type FeeMode = "sponsored" | "user_pays";

// ─── Connect Options ─────────────────────────────────────────────────────────

/**
 * Options for `sdk.connectWallet()`.
 *
 * @example
 * ```ts
 * import { StarkSigner, ArgentPreset } from "x";
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
 *   feeMode: "sponsored",
 * });
 * ```
 */
export interface ConnectWalletOptions {
  /** Account configuration */
  account: AccountConfig;
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
 *   onProgress: (e) => console.log(e.step)
 * });
 * ```
 */
export interface EnsureReadyOptions {
  /** When to deploy (default: "if_needed") */
  deploy?: DeployMode;
  /** Callback for progress updates */
  onProgress?: (event: ProgressEvent) => void;
}

// ─── Execute ─────────────────────────────────────────────────────────────────

/** Options for `wallet.execute()` */
export interface ExecuteOptions {
  /** How fees are paid */
  feeMode?: FeeMode;
  /** Optional time bounds for paymaster transactions */
  timeBounds?: PaymasterTimeBounds;
}

/** Options for `wallet.prepareSponsored()` */
export interface PrepareOptions {
  /** Optional time bounds for paymaster transactions */
  timeBounds?: PaymasterTimeBounds;
}

// ─── Preflight ───────────────────────────────────────────────────────────────

/**
 * Options for `wallet.preflight()`.
 * Checks if an operation can succeed before attempting it.
 */
export interface PreflightOptions {
  /** The calls to simulate */
  calls: Call[];
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
