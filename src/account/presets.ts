import {
  CallData,
  CairoCustomEnum,
  CairoOption,
  CairoOptionVariant,
  type Calldata,
} from "starknet";
import type { AccountClassConfig } from "../types/wallet.js";
import { parseP256PublicKey } from "../signer/webauthn.js";

/**
 * Devnet account preset.
 * Uses the pre-declared account class on starknet-devnet.
 */
export const DevnetPreset: AccountClassConfig = {
  classHash:
    "0x5b4b537eaa2399e3aa99c4e2e0208ebd6c71bc1467938cd52c798c601e43564",
  buildConstructorCalldata(publicKey: string): Calldata {
    return CallData.compile({ public_key: publicKey });
  },
};

/**
 * OpenZeppelin account preset.
 */
export const OpenZeppelinPreset: AccountClassConfig = {
  classHash:
    "0x061dac032f228abef9c6626f995015233097ae253a7f72d68552db02f2971b8f",
  buildConstructorCalldata(publicKey: string): Calldata {
    return CallData.compile({ publicKey });
  },
};

/**
 * Argent account preset.
 */
export const ArgentPreset: AccountClassConfig = {
  classHash:
    "0x036078334509b514626504edc9fb252328d1a240e4e948bef8d0c08dff45927f",
  buildConstructorCalldata(publicKey: string): Calldata {
    // Argent constructor: (owner, guardian)
    return CallData.compile({
      owner: publicKey,
      guardian: "0x0", // No guardian
    });
  },
};

/**
 * Braavos account preset.
 */
export const BraavosPreset: AccountClassConfig = {
  classHash:
    "0x00816dd0297efc55dc1e7559020a3a825e81ef734b558f03c83325d4da7e6253",
  buildConstructorCalldata(publicKey: string): Calldata {
    return CallData.compile({ public_key: publicKey });
  },
};

/**
 * ArgentX v0.5.0 account preset.
 * This is the account class used by Privy for Starknet wallets.
 *
 * @see https://docs.privy.io/recipes/use-tier-2#starknet
 */
export const ArgentXV050Preset: AccountClassConfig = {
  classHash:
    "0x073414441639dcd11d1846f287650a00c60c416b9d3ba45d31c651672125b2c2",
  buildConstructorCalldata(publicKey: string): Calldata {
    // ArgentX v0.5.0 uses CairoCustomEnum for the owner signer
    const axSigner = new CairoCustomEnum({ Starknet: { pubkey: publicKey } });
    const axGuardian = new CairoOption<unknown>(CairoOptionVariant.None);
    return CallData.compile({
      owner: axSigner,
      guardian: axGuardian,
    });
  },
};

/**
 * WebAuthn/P-256 account preset.
 * Use this with WebAuthnSigner for Face ID / Touch ID authentication.
 *
 * The public key is in uncompressed format: 04 || x (32 bytes) || y (32 bytes)
 * The constructor expects (x, y) as two u256 values, each split into (low, high) u128s.
 *
 * @example
 * ```typescript
 * const { signer, credential } = await WebAuthnSigner.create({
 *   rpId: "myapp.com",
 *   rpName: "My App",
 *   userId: "user123",
 *   userName: "user@example.com",
 * });
 *
 * const wallet = await sdk.connectWallet({
 *   account: {
 *     signer,
 *     accountClass: WebAuthnPreset,
 *   },
 * });
 * ```
 */
export const WebAuthnPreset: AccountClassConfig = {
  // TODO: Replace with your deployed P-256 account class hash
  classHash:
    "0x0000000000000000000000000000000000000000000000000000000000000000",

  buildConstructorCalldata(publicKey: string): Calldata {
    const { x, y } = parseP256PublicKey(publicKey);

    // Constructor: (public_key: (x: u256, y: u256))
    // u256 = { low: u128, high: u128 }
    return CallData.compile({
      public_key: {
        x: { low: x.low, high: x.high },
        y: { low: y.low, high: y.high },
      },
    });
  },

  getSalt(publicKey: string): string {
    // P-256 public key is too large for Pedersen hash.
    // Use x.low (lower 128 bits of x coordinate) as salt.
    // This is unique enough for address derivation.
    const { salt } = parseP256PublicKey(publicKey);
    return salt;
  },
};
