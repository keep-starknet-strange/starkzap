import type { SDKConfig } from "@/types";
import { Address } from "@/types";
import "dotenv/config";

/**
 * Test configuration for Starknet Sepolia testnet.
 */
export const testnetConfig: SDKConfig = {
  rpcUrl:
    process.env.TESTNET_RPC_URL ??
    "https://starknet-sepolia.public.blastapi.io",
  chainId: "SN_SEPOLIA",
  stakingContract:
    "0x03745ab04a431fc02871a139be6b93d9260b0ff3e779ad9c8b377183b23109f1" as Address,
};

/**
 * Test configuration for local devnet.
 * Requires starknet-devnet running locally.
 *
 * Start devnet with:
 *   starknet-devnet --seed 0
 */
export const devnetConfig: SDKConfig = {
  rpcUrl: process.env.DEVNET_RPC_URL ?? "http://127.0.0.1:5050",
  chainId: "SN_SEPOLIA", // Devnet uses Sepolia chain ID
};

/**
 * Pre-funded devnet account (when started with --seed 0)
 * Note: This is a valid Stark private key within curve order
 */
export const devnetAccount = {
  address: Address.from(
    "0x64b48806902a367c8598f4f95c305e8c1a1acba5f082d294a43793113115691"
  ),
  privateKey: "0x71d7bb07b9a64f6f78ac4c816aff4da9",
};

/**
 * Valid test private keys (within Stark curve order)
 * These are for testing only - never use in production!
 */
export const testPrivateKeys = {
  key1: "0x1",
  key2: "0x2",
  key3: "0x3",
  random: () => "0x" + Math.floor(Math.random() * 1000000).toString(16),
};

/**
 * Get config based on environment
 */
export function getTestConfig(): {
  config: SDKConfig;
  privateKey: string;
  network: "testnet" | "devnet";
} {
  const network =
    (process.env.TEST_NETWORK as "testnet" | "devnet") ?? "devnet";

  if (network === "testnet") {
    return {
      config: testnetConfig,
      privateKey: process.env.TEST_PRIVATE_KEY ?? testPrivateKeys.key1,
      network: "testnet",
    };
  }

  return {
    config: devnetConfig,
    privateKey: devnetAccount.privateKey,
    network: "devnet",
  };
}
