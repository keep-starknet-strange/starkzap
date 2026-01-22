import { CallData, type Calldata } from "starknet";
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
