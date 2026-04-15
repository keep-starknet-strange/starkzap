import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BRIDGE_TOKEN_CACHE_TTL_MS,
  BridgeTokenRepository,
} from "@/bridge/tokens/repository";
import * as ethersRuntime from "@/connect/ethersRuntime";
import * as solanaWeb3Runtime from "@/connect/solanaWeb3Runtime";
import {
  EthereumBridgeToken,
  ExternalChain,
  Protocol,
  SolanaBridgeToken,
} from "@/types";
import { StarkZapLogger } from "@/logger";

function createMockLogger() {
  return {
    instance: new StarkZapLogger(
      { debug() {}, info() {}, warn() {}, error() {} },
      "trace"
    ),
    spies: {
      warn: vi.fn() as ReturnType<typeof vi.fn>,
    },
    install() {
      this.spies.warn = vi.spyOn(this.instance, "warn");
      return this;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

function mockApiResponse() {
  return [
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
      l2_bridge_address:
        "0x073314940630fd6dcda0d772d4c972c4e0a9946bef9dabf4ef84eda8ef542b82",
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
      l2_bridge_address:
        "0x057ffe876468962e9a25d37e257f920e9c12f8f4ba0e2597b1f501a4bf88c470",
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
      l1_token_address: "tESy5CjdMHg24ZQcMqH51wNC61F2pSa4zzLmZnpep5d",
      l1_bridge_address: "9kenaf2JDRGSHRdLn4YjK2apJfu3yHGkowtF2CevzE7t",
      l2_bridge_address:
        "0x06a8f05b3860ab846b6e8bfc3160b7bb3a0bae41fd3fcfab65a896f0570e3e32",
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
    {
      id: "hidden-token",
      chain: "ethereum",
      protocol: "canonical",
      name: "Hidden",
      symbol: "HID",
      decimals: 18,
      hidden: true,
      l2_token_address:
        "0x01d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
      l1_token_address: "0x0000000000000000000000000000000000000000",
      l1_bridge_address: "0x1111111111111111111111111111111111111111",
      l2_bridge_address:
        "0x073314940630fd6dcda0d772d4c972c4e0a9946bef9dabf4ef84eda8ef542b82",
    },
    {
      id: "deprecated-token",
      chain: "ethereum",
      protocol: "canonical",
      name: "Deprecated",
      symbol: "DEP",
      decimals: 18,
      deprecated: true,
      l2_token_address:
        "0x02d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
      l1_token_address: "0x0000000000000000000000000000000000000000",
      l1_bridge_address: "0x1111111111111111111111111111111111111111",
      l2_bridge_address:
        "0x073314940630fd6dcda0d772d4c972c4e0a9946bef9dabf4ef84eda8ef542b82",
    },
  ];
}

describe("BridgeTokenRepository", () => {
  it("should throw a clear error when API payload is not a top-level array", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ tokens: mockApiResponse() }),
    });

    const repository = new BridgeTokenRepository({
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    await expect(repository.getTokens()).rejects.toThrow(
      "Invalid bridge tokens API response: expected a top-level array, received object."
    );
  });

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

    expect(tokens).toHaveLength(3);

    expect(tokens[0]).toBeInstanceOf(EthereumBridgeToken);
    expect(tokens[0]?.protocol).toBe(Protocol.CANONICAL);
    expect(tokens[0]?.chain).toBe(ExternalChain.ETHEREUM);

    expect(tokens[2]).toBeInstanceOf(SolanaBridgeToken);
    expect(tokens[2]?.protocol).toBe(Protocol.HYPERLANE);
    expect(tokens[2]?.chain).toBe(ExternalChain.SOLANA);
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

  it("should throw when explicit ethereum chain is requested and ethers is unavailable", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => mockApiResponse(),
    });
    const loadEthersError = new Error(
      '[starkzap] Bridge token parsing requires optional peer dependency "ethers". Install it with: npm i ethers'
    );
    vi.spyOn(ethersRuntime, "loadEthers").mockRejectedValue(loadEthersError);

    const repository = new BridgeTokenRepository({
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    await expect(
      repository.getTokens({ chain: ExternalChain.ETHEREUM })
    ).rejects.toThrow(
      '[starkzap] Bridge token parsing requires optional peer dependency "ethers". Install it with: npm i ethers'
    );
  });

  it("should throw token parse errors when an explicit chain is requested", async () => {
    const malformedEthereumToken = mockApiResponse().find(
      (token) => token.chain === "ethereum"
    );
    if (!malformedEthereumToken) {
      throw new Error("Missing ethereum fixture token");
    }

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => [
        {
          ...malformedEthereumToken,
          l1_token_address: "",
        },
      ],
    });

    const repository = new BridgeTokenRepository({
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    await expect(
      repository.getTokens({ chain: ExternalChain.ETHEREUM })
    ).rejects.toThrow('Missing required field "l1_token_address"');
  });

  it("should skip solana tokens and continue with ethereum when chain is not specified and solana runtime is unavailable", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => mockApiResponse(),
    });
    vi.spyOn(solanaWeb3Runtime, "loadSolanaWeb3").mockRejectedValue(
      new Error(
        '[starkzap] Bridge token parsing requires optional peer dependency "@solana/web3.js". Install it with: npm i @solana/web3.js'
      )
    );
    const mockLogger = createMockLogger().install();

    const repository = new BridgeTokenRepository({
      fetchFn: fetchMock as unknown as typeof fetch,
      logger: mockLogger.instance,
    });
    const tokens = await repository.getTokens();

    expect(tokens).toHaveLength(2);
    expect(
      tokens.every((token) => token.chain === ExternalChain.ETHEREUM)
    ).toBe(true);
    expect(mockLogger.spies.warn).toHaveBeenCalledWith(
      '[starkzap] Skipping solana bridge tokens because optional peer dependency "@solana/web3.js" is not installed.',
      expect.any(Error)
    );
  });

  it("should skip ethereum tokens and continue with solana when chain is not specified and ethers is unavailable", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => mockApiResponse(),
    });
    vi.spyOn(ethersRuntime, "loadEthers").mockRejectedValue(
      new Error(
        '[starkzap] Bridge token parsing requires optional peer dependency "ethers". Install it with: npm i ethers'
      )
    );
    const mockLogger = createMockLogger().install();

    const repository = new BridgeTokenRepository({
      fetchFn: fetchMock as unknown as typeof fetch,
      logger: mockLogger.instance,
    });
    const tokens = await repository.getTokens();

    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.chain).toBe(ExternalChain.SOLANA);
    expect(mockLogger.spies.warn).toHaveBeenCalledWith(
      '[starkzap] Skipping ethereum bridge tokens because optional peer dependency "ethers" is not installed.',
      expect.any(Error)
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

  it("should start cache TTL at cache write time after fetch resolves", async () => {
    let now = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      now += 500;
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => mockApiResponse(),
      };
    });

    const repository = new BridgeTokenRepository({
      fetchFn: fetchMock as unknown as typeof fetch,
      now: () => now,
    });

    await repository.getTokens({ env: "mainnet" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    now = BRIDGE_TOKEN_CACHE_TTL_MS + 499;
    await repository.getTokens({ env: "mainnet" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    now = BRIDGE_TOKEN_CACHE_TTL_MS + 500;
    await repository.getTokens({ env: "mainnet" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("should filter out hidden and deprecated tokens", async () => {
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

    expect(tokens.some((token) => token.id === "hidden-token")).toBe(false);
    expect(tokens.some((token) => token.id === "deprecated-token")).toBe(false);
  });
});
