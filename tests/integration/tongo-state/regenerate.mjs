#!/usr/bin/env node
/* global process, console */
/**
 * Regenerate the tongo devnet state dump.
 *
 * Prerequisites:
 *   - starknet-devnet installed locally (cargo install starknet-devnet)
 *   - Tongo contract built with scarb (scarb build in the tongo contracts package)
 *
 * Usage:
 *   node tests/integration/tongo-state/regenerate.mjs <path-to-tongo-contracts-target-dev>
 *
 * Example:
 *   git clone https://github.com/fatlabsxyz/tongo /tmp/tongo
 *   cd /tmp/tongo/packages/contracts && scarb build && cd -
 *   node tests/integration/tongo-state/regenerate.mjs /tmp/tongo/packages/contracts/target/dev
 */
import { Devnet, DevnetProvider } from "starknet-devnet";
import {
  RpcProvider,
  Account,
  json,
  CallData,
  CairoOption,
  CairoOptionVariant,
} from "starknet";
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const artifactsDir = process.argv[2];
if (!artifactsDir) {
  console.error(
    "Usage: node regenerate.mjs <path-to-tongo-contracts-target-dev>"
  );
  process.exit(1);
}

const sierraPath = path.join(artifactsDir, "tongo_Tongo.contract_class.json");
const sierra = json.parse(readFileSync(sierraPath, "utf-8"));

// Try to load CASM if available (scarb needs casm=true in [[target.starknet-contract]])
const casmPath = path.join(
  artifactsDir,
  "tongo_Tongo.compiled_contract_class.json"
);
let casm;
try {
  casm = json.parse(readFileSync(casmPath, "utf-8"));
} catch {
  console.log("No CASM file found, devnet will compile Sierra to CASM");
}

const STRK_ADDRESS =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const DUMP_PATH = path.join(__dirname, "devnet.state");
const META_PATH = path.join(__dirname, "devnet.json");

console.log("Starting devnet...");
const devnet = await Devnet.spawnInstalled({
  args: [
    "--seed",
    "100",
    "--chain-id",
    "MAINNET",
    "--block-generation-on",
    "transaction",
    "--accounts",
    "10",
    "--dump-on",
    "request",
    "--dump-path",
    DUMP_PATH,
  ],
  stdout: "ignore",
  stderr: "inherit",
  maxStartupMillis: 15000,
});

try {
  const devnetUrl = devnet.provider.url;
  console.log(`Devnet running at ${devnetUrl}`);

  const provider = new RpcProvider({ nodeUrl: devnetUrl });
  const devnetProvider = new DevnetProvider({ url: devnetUrl });

  // Get a predeployed account
  const accounts = await devnetProvider.getPredeployedAccounts();
  const acc = accounts[0];
  const deployer = new Account({
    provider,
    address: acc.address,
    signer: acc.private_key,
    cairoVersion: "1",
  });

  console.log(`Deployer: ${deployer.address}`);

  // Declare the contract
  console.log("Declaring Tongo contract...");
  const declarePayload = { contract: sierra };
  if (casm) declarePayload.casm = casm;
  const declareResult = await deployer.declareIfNot(declarePayload);
  if (declareResult.transaction_hash) {
    await provider.waitForTransaction(declareResult.transaction_hash, {
      retryInterval: 500,
    });
  }
  const classHash = declareResult.class_hash;
  console.log(`Class hash: ${classHash}`);

  // Build constructor calldata using the ABI
  const calldata = new CallData(sierra.abi);
  const constructorCalldata = calldata.compile("constructor", {
    owner: deployer.address,
    ERC20: STRK_ADDRESS,
    rate: { low: 1n, high: 0n },
    bit_size: 32,
    auditor_key: new CairoOption(CairoOptionVariant.None),
  });

  // Deploy the contract
  console.log("Deploying Tongo contract...");
  const deployResult = await deployer.deployContract({
    classHash,
    constructorCalldata,
    salt: "0",
  });
  await provider.waitForTransaction(deployResult.transaction_hash, {
    retryInterval: 500,
  });

  const tongoAddress = deployResult.contract_address;
  console.log(`Tongo deployed at: ${tongoAddress}`);

  // Dump state via RPC
  console.log("Dumping state...");
  await devnetProvider.dump(DUMP_PATH);

  // Save metadata
  const meta = {
    state: "devnet.state",
    contracts: {
      Tongo: {
        class_hash: classHash,
        address: tongoAddress,
      },
      STRK: {
        address: STRK_ADDRESS,
      },
    },
  };
  writeFileSync(META_PATH, JSON.stringify(meta, null, 2) + "\n");
  console.log(`Metadata written to ${META_PATH}`);

  console.log("Done! State dumped to", DUMP_PATH);
} finally {
  devnet.kill();
}
