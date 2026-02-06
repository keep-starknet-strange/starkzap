import {
  CallData,
  CairoCustomEnum,
  CairoOption,
  CairoOptionVariant,
  type Calldata,
  num,
  uint256,
} from "starknet";
import type { AccountClassConfig } from "@/types";

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
 * OpenZeppelin account preset (Stark curve).
 */
export const OpenZeppelinPreset: AccountClassConfig = {
  classHash:
    "0x01d1777db36cdd06dd62cfde77b1b6ae06412af95d57a13dc40ac77b8a702381",
  buildConstructorCalldata(publicKey: string): Calldata {
    return CallData.compile({ publicKey });
  },
};

/**
 * Parse secp256k1 public key JSON.
 */
function parseEthPubKey(publicKey: string): { x: bigint; y: bigint } {
  let parsed: { x?: string; y?: string };
  try {
    parsed = JSON.parse(publicKey) as { x?: string; y?: string };
  } catch {
    throw new Error(
      "OpenZeppelinEthPreset: public key must be JSON: {\"x\":\"0x...\",\"y\":\"0x...\"}"
    );
  }

  if (!parsed.x || !parsed.y) {
    throw new Error("OpenZeppelinEthPreset: missing x or y in public key JSON");
  }

  const x = parsed.x;
  const y = parsed.y;
  return { x: BigInt(x), y: BigInt(y) };
}

/**
 * OpenZeppelin Ethereum account preset (secp256k1 curve).
 * Uses Ethereum-style signatures for Starknet accounts.
 *
 * The public key must be a JSON string with x and y coordinates:
 * `{"x":"0x...","y":"0x..."}`
 */
export const OpenZeppelinEthPreset: AccountClassConfig = {
  classHash:
    "0x000b5bcc16b8b0d86c24996e22206f6071bb8d7307837a02720f0ce2fa1b3d7c",

  buildConstructorCalldata(publicKey: string): Calldata {
    const { x, y } = parseEthPubKey(publicKey);
    const xU256 = uint256.bnToUint256(x);
    const yU256 = uint256.bnToUint256(y);

    return [
      num.toHex(xU256.low),
      num.toHex(xU256.high),
      num.toHex(yU256.low),
      num.toHex(yU256.high),
    ];
  },

  getSalt(publicKey: string): string {
    // Use x coordinate as salt (truncated to felt252 range)
    const { x } = parseEthPubKey(publicKey);
    // Felt252 max is ~2^251, so we mask to ensure it fits
    const feltMax = (1n << 251n) - 1n;
    return "0x" + (x & feltMax).toString(16);
  },
};

/**
 * Argent account preset (v0.4.0).
 * Uses CairoCustomEnum for the owner signer.
 */
export const ArgentPreset: AccountClassConfig = {
  classHash:
    "0x036078334509b514626504edc9fb252328d1a240e4e948bef8d0c08dff45927f",
  buildConstructorCalldata(publicKey: string): Calldata {
    // ArgentX v0.4.0 uses CairoCustomEnum for the owner signer
    const axSigner = new CairoCustomEnum({ Starknet: { pubkey: publicKey } });
    const axGuardian = new CairoOption<unknown>(CairoOptionVariant.None);
    return CallData.compile({
      owner: axSigner,
      guardian: axGuardian,
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
