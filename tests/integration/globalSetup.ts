import type { TestProject } from "vitest/node";
import { Devnet } from "starknet-devnet";
import "dotenv/config";
import { getChainId } from "../../src/types/config.js";
import { forkRPC, type TestConfig } from "./shared";
import { RpcProvider } from "starknet";

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
    console.log("Starting starknet-devnet (with fork)...");
  } else {
    console.log("Starting starknet-devnet...");
  }

  devnet = await Devnet.spawnVersion(DEVNET_VERSION, {
    args,
    stdout: "ignore",
    stderr: "ignore",
    maxStartupMillis: 15000,
  });

  const devnetUrl = devnet.provider.url;
  const provider = new RpcProvider({ nodeUrl: devnetUrl });
  const chainId = await getChainId(provider);
  const testConfig: TestConfig = {
    rpcUrl: devnetUrl,
    chainId: chainId.toLiteral(),
  };

  console.log(`✅ Devnet running at ${devnetUrl}`);
  console.log("🛜 Network: ", chainId.toLiteral(), "\n");
  project.provide("testConfig", testConfig);

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
    testConfig: TestConfig;
  }
}
