import { describe, expect, it } from "vitest";
import { BridgeCache } from "@/bridge/operator/BridgeCache";
import { ExternalChain, Protocol, type BridgeToken } from "@/types";
import { fromEthereumAddress } from "@/connect/ethersRuntime";
import type { ConnectedExternalWallet } from "@/connect";
import type { BridgeInterface } from "@/bridge/types/BridgeInterface";
import { getAddress } from "ethers";

const normalizeEthereumAddress = (value: string) =>
  fromEthereumAddress(value, { getAddress });

function mockToken(
  overrides: Partial<
    Pick<BridgeToken, "id" | "chain" | "protocol" | "address">
  > = {}
): BridgeToken {
  return {
    id: "token",
    name: "Token",
    symbol: "TKN",
    coingeckoId: undefined,
    decimals: 18,
    address: "token-address",
    bridgeAddress: "bridge-address",
    starknetAddress: "0x1",
    starknetBridge: "0x2",
    chain: ExternalChain.ETHEREUM,
    protocol: Protocol.CANONICAL,
    ...overrides,
  } as unknown as BridgeToken;
}

function mockWallet(
  overrides: Partial<
    Pick<ConnectedExternalWallet, "chain" | "network" | "address">
  > = {}
): ConnectedExternalWallet {
  return {
    chain: ExternalChain.ETHEREUM,
    network: "shared-network",
    address: "shared-wallet",
    ...overrides,
  } as unknown as ConnectedExternalWallet;
}

function randomEthereumAddressWithIndex(index: number) {
  const hexIndex = index.toString(16);
  const suffix =
    hexIndex.length >= 8 ? hexIndex.slice(-8) : hexIndex.padStart(8, "0");
  const randomPrefix = Array.from({ length: 40 - suffix.length }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");

  return normalizeEthereumAddress(`0x${randomPrefix}${suffix}`);
}

describe("BridgeCache", () => {
  it("evicts failed bridge promises for the same key", async () => {
    const cache = new BridgeCache();
    const wallet = mockWallet({ chain: ExternalChain.ETHEREUM });
    const token = mockToken({
      id: "usdc",
      chain: ExternalChain.ETHEREUM,
      protocol: Protocol.CANONICAL,
      address: normalizeEthereumAddress(
        "0xcea4d3660f2a915177bbda67f7f6d1da29f3f682"
      ),
    });

    const failingPromise = Promise.reject(new Error("bridge creation failed"));
    cache.set(
      token,
      wallet,
      failingPromise as unknown as Promise<BridgeInterface>
    );

    const cached = cache.get(token, wallet);
    expect(cached).toBeDefined();
    await expect(cached!).rejects.toThrow("bridge creation failed");
    expect(cache.get(token, wallet)).toBeUndefined();
  });

  it("does not evict a newer entry when an older promise rejects", async () => {
    const cache = new BridgeCache();
    const wallet = mockWallet({ chain: ExternalChain.ETHEREUM });
    const token = mockToken({
      id: "usdc",
      chain: ExternalChain.ETHEREUM,
      protocol: Protocol.CANONICAL,
      address: normalizeEthereumAddress(
        "0xdc6b3a9f651ec03b0ba8a0f30d302ae4d56f066f"
      ),
    });

    let rejectOld: ((reason?: unknown) => void) | undefined;
    const oldPromise = new Promise<BridgeInterface>((_, reject) => {
      rejectOld = reject;
    });

    cache.set(token, wallet, oldPromise);
    const oldGuarded = cache.get(token, wallet);
    expect(oldGuarded).toBeDefined();

    cache.set(token, wallet, Promise.resolve({} as unknown as BridgeInterface));
    const currentGuarded = cache.get(token, wallet);
    expect(currentGuarded).toBeDefined();

    rejectOld?.(new Error("old failed"));
    await expect(oldGuarded!).rejects.toThrow("old failed");
    expect(cache.get(token, wallet)).toBe(currentGuarded);
  });

  it("evicts the least recently used bridge when cache reaches capacity", () => {
    const cache = new BridgeCache();
    const wallet = mockWallet({ chain: ExternalChain.ETHEREUM });
    const maxBridgeCacheSize = 128;

    const tokens = Array.from({ length: maxBridgeCacheSize + 1 }, (_, index) =>
      mockToken({
        id: `token-${index}`,
        chain: ExternalChain.ETHEREUM,
        protocol: Protocol.CANONICAL,
        address: randomEthereumAddressWithIndex(index),
      })
    );

    for (let i = 0; i < maxBridgeCacheSize; i += 1) {
      cache.set(
        tokens[i] as BridgeToken,
        wallet,
        Promise.resolve({} as unknown as BridgeInterface)
      );
    }

    const mostRecentlyUsed = tokens[0] as BridgeToken;
    cache.get(mostRecentlyUsed, wallet);

    cache.set(
      tokens[maxBridgeCacheSize] as BridgeToken,
      wallet,
      Promise.resolve({} as unknown as BridgeInterface)
    );

    expect(cache.get(tokens[1] as BridgeToken, wallet)).toBeUndefined();
    expect(cache.get(mostRecentlyUsed, wallet)).toBeDefined();
    expect(
      cache.get(tokens[maxBridgeCacheSize] as BridgeToken, wallet)
    ).toBeDefined();
  });

  it("keeps distinct entries for same token address on different chains", () => {
    const cache = new BridgeCache();
    const ethWallet = mockWallet({ chain: ExternalChain.ETHEREUM });
    const solWallet = mockWallet({ chain: ExternalChain.SOLANA });
    const ethToken = mockToken({
      id: "usdc",
      chain: ExternalChain.ETHEREUM,
      protocol: Protocol.CANONICAL,
      address: normalizeEthereumAddress(
        "0x2E57CD88C8bf6D7dA3f0eaE096dFeF6E2998020a"
      ),
    });
    const solToken = mockToken({
      id: "usdc",
      chain: ExternalChain.SOLANA,
      protocol: Protocol.HYPERLANE,
      address: normalizeEthereumAddress(
        "0x359592B2727993bBE57E7e22CbFf424dC3395f7f"
      ),
    });

    cache.set(
      ethToken,
      ethWallet,
      Promise.resolve({} as unknown as BridgeInterface)
    );
    cache.set(
      solToken,
      solWallet,
      Promise.resolve({} as unknown as BridgeInterface)
    );

    const ethBridge = cache.get(ethToken, ethWallet);
    const solBridge = cache.get(solToken, solWallet);

    expect(ethBridge).toBeDefined();
    expect(solBridge).toBeDefined();
    expect(ethBridge).not.toBe(solBridge);
  });

  it("keeps distinct entries for protocol migrations of the same token", () => {
    const cache = new BridgeCache();
    const wallet = mockWallet({ chain: ExternalChain.ETHEREUM });
    const canonical = mockToken({
      id: "usdc",
      chain: ExternalChain.ETHEREUM,
      protocol: Protocol.CANONICAL,
      address: normalizeEthereumAddress(
        "0xd1B14a3C22c4DE9836eEAD138C8FDFaC370D16B0"
      ),
    });
    const migrated = mockToken({
      id: "usdc",
      chain: ExternalChain.ETHEREUM,
      protocol: Protocol.OFT_MIGRATED,
      address: normalizeEthereumAddress(
        "0x433f18a35BD83765EB309fb321b1eD36A7CB3289"
      ),
    });

    cache.set(
      canonical,
      wallet,
      Promise.resolve({} as unknown as BridgeInterface)
    );
    cache.set(
      migrated,
      wallet,
      Promise.resolve({} as unknown as BridgeInterface)
    );

    const canonicalBridge = cache.get(canonical, wallet);
    const migratedBridge = cache.get(migrated, wallet);

    expect(canonicalBridge).toBeDefined();
    expect(migratedBridge).toBeDefined();
    expect(canonicalBridge).not.toBe(migratedBridge);
  });
});
