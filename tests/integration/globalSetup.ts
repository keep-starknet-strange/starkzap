import type { TestProject } from "vitest/node";
import { Devnet } from "starknet-devnet";
import "dotenv/config";
import { type SDKConfig } from "../../src/types/config.js";
import { forkRPC } from "./shared";

let devnet: Devnet | null = null;

// Compatibility constants
const DEVNET_VERSION = "v0.7.2";
const RPC_VERSION = "v0_10";

/**
 * Global setup for integration tests.
 *
 * Spawns starknet-devnet before all integration tests run.
 * Supports forking from a live network via FORK_NETWORK env var.
 *
 * Environment variables:
 *   FORK_NETWORK - URL to fork from (e.g., https://starknet-sepolia.public.blastapi.io)
 *
 * @see https://github.com/0xSpaceShard/starknet-devnet-js
 * @see https://0xspaceshard.github.io/starknet-devnet/docs/forking
 */
export default async function setup(project: TestProject) {
  const forkNetwork = forkRPC(RPC_VERSION);

  const args = ["--seed", "0"];
  if (forkNetwork) {
    args.push("--fork-network", forkNetwork);
    console.log(
      `\nStarting starknet-devnet (forking from ${forkNetwork})...\n`
    );
  } else {
    console.log("\nStarting starknet-devnet...\n");
  }

  console.log("Devnet not installed, spawning compatible version...");
  devnet = await Devnet.spawnVersion(DEVNET_VERSION, {
    args,
    stdout: "ignore",
    stderr: "ignore",
    maxStartupMillis: 15000,
  });

  const devnetUrl = devnet.provider.url;
  const sdkConfig: SDKConfig = {
    rpcUrl: devnetUrl,
    chainId: "SN_SEPOLIA", // Devnet uses Sepolia chain ID
  };

  console.log(`✅ Devnet running at ${devnetUrl}\n`);
  project.provide("sdkConfig", sdkConfig);

  // Return teardown function
  return function teardown() {
    console.log("\nStopping starknet-devnet...\n");
    if (devnet) {
      devnet.kill();
      devnet = null;
    }
  };
}

// Type declaration for inject/provide
declare module "vitest" {
  export interface ProvidedContext {
    sdkConfig: SDKConfig;
  }
}
