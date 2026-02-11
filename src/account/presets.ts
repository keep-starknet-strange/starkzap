import {
  CallData,
  CairoCustomEnum,
  CairoOption,
  CairoOptionVariant,
  type Calldata,
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
 * Braavos account preset (v1.2.0) with Stark key.
 *
 * Uses BraavosBaseAccount for deployment which then upgrades to BraavosAccount.
 *
 * Deployment signature format (15 elements):
 * - [0-1]: Transaction signature (r, s)
 * - [2]: Implementation class hash (BraavosAccount)
 * - [3-11]: Auxiliary data (zeros for basic Stark-only account)
 * - [12]: Chain ID as felt
 * - [13-14]: Auxiliary data signature (r, s)
 *
 * @see https://github.com/myBraavos/braavos-account-cairo
 */
export const BraavosPreset: AccountClassConfig = {
  // BraavosBaseAccount class hash - used for deployment
  classHash:
    "0x03d16c7a9a60b0593bd202f660a28c5d76e0403601d9ccc7e4fa253b6a70c201",

  buildConstructorCalldata(publicKey: string): Calldata {
    // Constructor takes just the Stark public key
    return [publicKey];
  },

  getSalt(publicKey: string): string {
    // Salt is the public key (same as constructor calldata)
    return publicKey;
  },
};

/**
 * Braavos implementation class hash (for reference).
 * This is the class the account upgrades to after deployment.
 */
export const BRAAVOS_IMPL_CLASS_HASH =
  "0x03957f9f5a1cbfe918cedc2015c85200ca51a5f7506ecb6de98a5207b759bf8a";

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

export const accountPresets = {
  devnet: DevnetPreset,
  openzeppelin: OpenZeppelinPreset,
  argent: ArgentPreset,
  braavos: BraavosPreset,
  argentXV050: ArgentXV050Preset,
} as const;

export type AccountPresetName = keyof typeof accountPresets;
