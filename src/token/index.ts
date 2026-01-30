import type { ChainId, Token } from "../types/index.js";
import { mainnetTokens } from "./presets.js";
import { sepoliaTokens } from "./presets.sepolia.js";

export * from "@/token/presets";
export * from "@/token/presets.sepolia";

export function getPresets(chainId: ChainId): Record<string, Token> {
  switch (chainId) {
    case "SN_MAIN":
      return mainnetTokens;
    case "SN_SEPOLIA":
      return sepoliaTokens;
    default:
      return {};
  }
}
