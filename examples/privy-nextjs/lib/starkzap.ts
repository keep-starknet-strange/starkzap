import {
  StarkZap,
  ChainId,
  ArgentPreset,
  OpenZeppelinPreset,
  type WalletInterface,
  type AccountClassConfig,
} from 'starkzap';

// Configuration
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_9';
const SDK_CHAIN_ID = ChainId.SEPOLIA;

// Available account presets
export const PRESETS: Record<string, AccountClassConfig> = {
  argent: ArgentPreset,
  openzeppelin: OpenZeppelinPreset,
} as const;

// SDK instance (singleton)
let sdkInstance: StarkZap | null = null;

export function getSDK(): StarkZap {
  if (!sdkInstance) {
    sdkInstance = new StarkZap({
      rpcUrl: RPC_URL,
      chainId: SDK_CHAIN_ID,
    });
  }
  return sdkInstance;
}

export type { WalletInterface };
export { ChainId, ArgentPreset, OpenZeppelinPreset };
