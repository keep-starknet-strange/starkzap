import {
  CallData,
  CairoCustomEnum,
  CairoOption,
  CairoOptionVariant,
  type Calldata,
} from "starknet";
import type { AccountClassConfig } from "../types/wallet.js";

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
