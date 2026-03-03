import { describe, expect, it, vi } from "vitest";
import { BridgeTokenRepository, BRIDGE_TOKEN_CACHE_TTL_MS } from "@/bridge";
import {
  BitcoinRunesBridgeToken,
  EthereumBridgeToken,
  ExternalChain,
  Protocol,
  SolanaBridgeToken,
} from "@/types";

function mockApiResponse() {
  return {
    tokens: [
      {
        id: "lords",
        chain: "ethereum",
        protocol: "canonical",
        name: "Ethereum",
        symbol: "ETH",
        decimals: 18,
        l2_token_address:
          "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
        l1_token_address: "0x0000000000000000000000000000000000000000",
        l1_bridge_address: "0x1111111111111111111111111111111111111111",
      },
      {
        id: "usdc",
        chain: "ethereum",
        protocol: "cctp",
        name: "USDC",
        symbol: "USDC",
        decimals: 6,
        l2_token_address:
          "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
        l1_token_address: "0x2222222222222222222222222222222222222222",
        l1_bridge_address: "0x3333333333333333333333333333333333333333",
      },
      {
        id: "sol",
        chain: "solana",
        protocol: "hyperlane",
        name: "Solana",
        symbol: "SOL",
        decimals: 9,
        l2_token_address:
          "0x0437d8f4f4e3eb7022f4b96f4f58f949bc2ad2f0b6f7eb02d4f9a5f8f4d3f001",
        solana_token_address: "So11111111111111111111111111111111111111112",
        l1_token_address: "So11111111111111111111111111111111111111112",
      },
      {
        id: "dog",
        chain: "bitcoin-runes",
        protocol: "bitcoin-runes",
        name: "Rune",
        symbol: "RUNE",
        decimals: 8,
        l2_token_address:
          "0x01e6545cab7ba4ac866768ba5e1bd540893762286ed3fea7f9c02bfa147e135b",
        bitcoin_runes_id: "840000:1",
        l2_token_bridge:
          "0x07d421b9ca8aa32df259965cda8acb93f7599f69209a41872ae84638b2a20f2a",
      },
    ],
  };
}

describe("BridgeTokenRepository", () => {
  it("should map API tokens into protocol-specific token classes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => mockApiResponse(),
    });

    const repository = new BridgeTokenRepository({
      fetchFn: fetchMock as unknown as typeof fetch,
    });
    const tokens = await repository.getTokens();

    expect(tokens).toHaveLength(4);

    expect(tokens[0]).toBeInstanceOf(EthereumBridgeToken);
    expect(tokens[0]?.protocol).toBe(Protocol.CANONICAL);
    expect(tokens[0]?.chain).toBe(ExternalChain.ETHEREUM);

    expect(tokens[2]).toBeInstanceOf(SolanaBridgeToken);
    expect(tokens[2]?.protocol).toBe(Protocol.HYPERLANE);
    expect(tokens[2]?.chain).toBe(ExternalChain.SOLANA);

    expect(tokens[3]).toBeInstanceOf(BitcoinRunesBridgeToken);
    expect(tokens[3]?.protocol).toBe(Protocol.BITCOIN_RUNES);
    expect(tokens[3]?.chain).toBe(ExternalChain.BITCOIN_RUNES);
  });

  it("should send optional env and chain query params when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => mockApiResponse(),
    });

    const repository = new BridgeTokenRepository({
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    await repository.getTokens({
      env: "testnet",
      chain: ExternalChain.SOLANA,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCallUrl = fetchMock.mock.calls[0]?.[0];
    expect(firstCallUrl).toBe(
      "https://starkgate.starknet.io/tokens/api/tokens?env=testnet&chain=solana"
    );
  });

  it("should cache token results for one hour per query", async () => {
    let now = 0;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => mockApiResponse(),
    });

    const repository = new BridgeTokenRepository({
      fetchFn: fetchMock as unknown as typeof fetch,
      now: () => now,
    });

    await repository.getTokens({ env: "mainnet" });
    await repository.getTokens({ env: "mainnet" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    now = BRIDGE_TOKEN_CACHE_TTL_MS - 1;
    await repository.getTokens({ env: "mainnet" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    now = BRIDGE_TOKEN_CACHE_TTL_MS;
    await repository.getTokens({ env: "mainnet" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
