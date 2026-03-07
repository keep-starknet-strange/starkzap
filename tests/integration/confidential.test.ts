import { beforeAll, describe, expect, it } from "vitest";
import { Account, RpcProvider } from "starknet";
import { Devnet, DevnetProvider } from "starknet-devnet";

import { keccak } from "@scure/starknet";
import { Confidential } from "@/confidential";
import path from "path";
import { readFileSync } from "fs";

// ─── Test helpers ───────────────────────────────────────────────────────────

/** Deterministic key derivation for tests (matches tongo-sdk's KeyGen). */
class KeyGen {
  readonly seed: bigint;
  constructor(seed?: string) {
    this.seed = keccak(new TextEncoder().encode(seed ?? "tongo"));
  }
  from(x: number) {
    return this.seed + BigInt(x);
  }
}

const TONGO_STATE_DIR = path.resolve(__dirname, "tongo-state");
const tongoMeta = JSON.parse(
  readFileSync(path.join(TONGO_STATE_DIR, "devnet.json"), "utf-8")
) as {
  contracts: {
    Tongo: { address: string };
    STRK: { address: string };
  };
};

const TONGO_CONTRACT = tongoMeta.contracts.Tongo.address;

// ─── Test suite ─────────────────────────────────────────────────────────────

describe("Confidential (Integration)", () => {
  let devnet: Devnet | null = null;
  let provider: RpcProvider;
  let devnetProvider: DevnetProvider;
  let devnetRunning = false;

  beforeAll(async () => {
    try {
      devnet = await Devnet.spawnInstalled({
        args: [
          "--seed",
          "100",
          "--chain-id",
          "MAINNET",
          "--block-generation-on",
          "transaction",
          "--accounts",
          "10",
          "--port",
          "5110",
          "--dump-path",
          path.join(TONGO_STATE_DIR, "devnet.state"),
        ],
        stdout: "ignore",
        stderr: "ignore",
        maxStartupMillis: 60000,
      });

      const devnetUrl = devnet.provider.url;
      provider = new RpcProvider({ nodeUrl: devnetUrl });
      devnetProvider = new DevnetProvider({ url: devnetUrl });
      devnetRunning = await devnetProvider.isAlive();

      if (devnetRunning) {
        console.log(`Tongo devnet running at ${devnetUrl}`);
      }
    } catch (e) {
      console.warn(
        "Could not start tongo devnet, skipping confidential integration tests:",
        e
      );
    }

    return () => {
      if (devnet) {
        devnet.kill();
        devnet = null;
      }
    };
  }, 120_000);

  async function getRelayer(index: number): Promise<Account> {
    const accounts = await devnetProvider.getPredeployedAccounts();
    const acc = accounts[index]!;
    return new Account({
      provider,
      address: acc.address,
      signer: acc.private_key,
      cairoVersion: "1",
      transactionVersion: "0x3",
    });
  }

  it("should fund a confidential account and read the balance", async () => {
    if (!devnetRunning) {
      console.log("Skipping: tongo devnet not running");
      return;
    }

    const kg = new KeyGen("starkzap-fund");
    const relayer = await getRelayer(0);
    const privateKey = kg.from(1);

    const confidential = new Confidential({
      privateKey,
      contractAddress: TONGO_CONTRACT as never,
      provider,
    });

    // Fund via tongo-sdk directly (need approve + fund)
    const tongoAccount = confidential.getTongoAccount();
    const fundOp = await tongoAccount.fund({
      amount: 100n,
      sender: relayer.address,
    });

    const response = await relayer.execute([
      fundOp.approve!,
      fundOp.toCalldata(),
    ]);
    await provider.waitForTransaction(response.transaction_hash, {
      retryInterval: 500,
    });

    // Read state via Confidential wrapper
    const state = await confidential.getState();
    expect(state.balance).toBe(100n);
    expect(state.pending).toBe(0n);
    expect(state.nonce).toBe(1n);

    // Verify nonce accessor
    const nonce = await confidential.getNonce();
    expect(nonce).toBe(1n);

    // Verify tongo address is valid
    expect(confidential.tongoAddress).toBeDefined();
    expect(typeof confidential.tongoAddress).toBe("string");
  });

  it("should build fund calls via populateFund", async () => {
    if (!devnetRunning) {
      console.log("Skipping: tongo devnet not running");
      return;
    }

    const kg = new KeyGen("starkzap-populate-fund");
    const relayer = await getRelayer(1);
    const privateKey = kg.from(1);

    const confidential = new Confidential({
      privateKey,
      contractAddress: TONGO_CONTRACT as never,
      provider,
    });

    // Use populateFund to get calls
    const calls = await confidential.populateFund({
      amount: 50n,
      sender: relayer.address as never,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.contractAddress).toBe(TONGO_CONTRACT);

    // We also need the approve call — get it from the underlying account
    const tongoAccount = confidential.getTongoAccount();
    const fundOp = await tongoAccount.fund({
      amount: 50n,
      sender: relayer.address,
    });

    const response = await relayer.execute([
      fundOp.approve!,
      fundOp.toCalldata(),
    ]);
    await provider.waitForTransaction(response.transaction_hash, {
      retryInterval: 500,
    });

    const state = await confidential.getState();
    expect(state.balance).toBe(50n);
  });

  it("should fund and transfer between confidential accounts", async () => {
    if (!devnetRunning) {
      console.log("Skipping: tongo devnet not running");
      return;
    }

    const kg = new KeyGen("starkzap-transfer");
    const relayer = await getRelayer(2);

    const sender = new Confidential({
      privateKey: kg.from(1),
      contractAddress: TONGO_CONTRACT as never,
      provider,
    });
    const receiver = new Confidential({
      privateKey: kg.from(2),
      contractAddress: TONGO_CONTRACT as never,
      provider,
    });

    // Fund sender via tongo account directly
    const senderAccount = sender.getTongoAccount();
    const fundOp = await senderAccount.fund({
      amount: 100n,
      sender: relayer.address,
    });
    const fundResponse = await relayer.execute([
      fundOp.approve!,
      fundOp.toCalldata(),
    ]);
    await provider.waitForTransaction(fundResponse.transaction_hash, {
      retryInterval: 500,
    });

    // Transfer using populateTransfer
    const receiverAccount = receiver.getTongoAccount();
    const transferCalls = await sender.populateTransfer({
      amount: 23n,
      to: receiverAccount.publicKey,
      sender: relayer.address as never,
    });

    expect(transferCalls).toHaveLength(1);

    const transferResponse = await relayer.execute(transferCalls);
    await provider.waitForTransaction(transferResponse.transaction_hash, {
      retryInterval: 500,
    });

    // Check sender balance
    const senderState = await sender.getState();
    expect(senderState.balance).toBe(77n); // 100 - 23
    expect(senderState.nonce).toBe(2n);

    // Receiver has pending balance (needs rollover to activate)
    const receiverState = await receiver.getState();
    expect(receiverState.pending).toBe(23n);
    expect(receiverState.balance).toBe(0n);
  });

  it("should rollover pending balance", async () => {
    if (!devnetRunning) {
      console.log("Skipping: tongo devnet not running");
      return;
    }

    const kg = new KeyGen("starkzap-rollover");
    const relayer = await getRelayer(3);

    const sender = new Confidential({
      privateKey: kg.from(1),
      contractAddress: TONGO_CONTRACT as never,
      provider,
    });
    const receiver = new Confidential({
      privateKey: kg.from(2),
      contractAddress: TONGO_CONTRACT as never,
      provider,
    });

    // Fund sender
    const senderAccount = sender.getTongoAccount();
    const fundOp = await senderAccount.fund({
      amount: 100n,
      sender: relayer.address,
    });
    await relayer
      .execute([fundOp.approve!, fundOp.toCalldata()])
      .then((r) =>
        provider.waitForTransaction(r.transaction_hash, { retryInterval: 500 })
      );

    // Transfer to receiver
    const receiverAccount = receiver.getTongoAccount();
    const transferCalls = await sender.populateTransfer({
      amount: 30n,
      to: receiverAccount.publicKey,
      sender: relayer.address as never,
    });
    await relayer
      .execute(transferCalls)
      .then((r) =>
        provider.waitForTransaction(r.transaction_hash, { retryInterval: 500 })
      );

    // Verify pending
    const beforeRollover = await receiver.getState();
    expect(beforeRollover.pending).toBe(30n);
    expect(beforeRollover.balance).toBe(0n);

    // Rollover
    const rolloverCalls = await receiver.populateRollover({
      sender: relayer.address as never,
    });
    expect(rolloverCalls).toHaveLength(1);

    await relayer
      .execute(rolloverCalls)
      .then((r) =>
        provider.waitForTransaction(r.transaction_hash, { retryInterval: 500 })
      );

    // After rollover, pending becomes active balance
    const afterRollover = await receiver.getState();
    expect(afterRollover.balance).toBe(30n);
    expect(afterRollover.pending).toBe(0n);
  });
});
