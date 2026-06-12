import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BRIDGE_TOKEN_CACHE_TTL_MS,
  BridgeTokenRepository,
  LAYERSWAP_DEGRADED_CACHE_TTL_MS,
} from "@/bridge/tokens/repository";
import * as ethersRuntime from "@/connect/ethersRuntime";
import * as solanaWeb3Runtime from "@/connect/solanaWeb3Runtime";
import {
  ContractRoutedEthereumBridgeToken,
  ContractRoutedSolanaBridgeToken,
  EthereumBridgeToken,
  ExternalChain,
  Protocol,
  SolanaBridgeToken,
} from "@/types";
import type {
  LayerswapTokenSource,
  LsRoute,
  LsToken,
} from "@/bridge/ethereum/layerswap/types";
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

    // Contract-routed protocols carry the bridge-contract addresses, so they
    // parse to the ContractRouted* subclasses.
    expect(tokens[0]).toBeInstanceOf(ContractRoutedEthereumBridgeToken);
    expect(tokens[0]?.protocol).toBe(Protocol.CANONICAL);
    expect(tokens[0]?.chain).toBe(ExternalChain.ETHEREUM);

    expect(tokens[2]).toBeInstanceOf(ContractRoutedSolanaBridgeToken);
    expect(tokens[2]?.protocol).toBe(Protocol.HYPERLANE);
    expect(tokens[2]?.chain).toBe(ExternalChain.SOLANA);
  });

  it("should ignore layerswap-protocol rows from StarkGate (the Layerswap API is their sole source)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => [
        {
          id: "eth-layerswap",
          chain: "ethereum",
          protocol: "layerswap",
          name: "Ethereum",
          symbol: "ETH",
          decimals: 18,
          l1_token_address: "0x0000000000000000000000000000000000000000",
          l2_token_address:
            "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
        },
      ],
    });

    const repository = new BridgeTokenRepository({
      fetchFn: fetchMock as unknown as typeof fetch,
    });
    const tokens = await repository.getTokens();

    expect(tokens).toHaveLength(0);
  });

  it("should parse CCTP tokens to the plain base classes (resolves contracts from constants, not the record)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => [
        {
          id: "usdc-cctp",
          chain: "ethereum",
          protocol: "cctp",
          name: "USD Coin",
          symbol: "USDC",
          decimals: 6,
          l1_token_address: "0x0000000000000000000000000000000000000000",
          l2_token_address:
            "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
        },
      ],
    });

    const repository = new BridgeTokenRepository({
      fetchFn: fetchMock as unknown as typeof fetch,
    });
    const tokens = await repository.getTokens();

    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.protocol).toBe(Protocol.CCTP);
    expect(tokens[0]).toBeInstanceOf(EthereumBridgeToken);
    expect(tokens[0]).not.toBeInstanceOf(ContractRoutedEthereumBridgeToken);
  });

  it("should throw when a contract-routed token is missing a bridge address", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => [
        {
          id: "broken-canonical",
          chain: "ethereum",
          protocol: "canonical",
          name: "Ethereum",
          symbol: "ETH",
          decimals: 18,
          l1_token_address: "0x0000000000000000000000000000000000000000",
          l2_token_address:
            "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
          // l1_bridge_address omitted
          l2_bridge_address:
            "0x073314940630fd6dcda0d772d4c972c4e0a9946bef9dabf4ef84eda8ef542b82",
        },
      ],
    });

    const repository = new BridgeTokenRepository({
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    await expect(
      repository.getTokens({ chain: ExternalChain.ETHEREUM })
    ).rejects.toThrow('Missing required field "l1_bridge_address"');
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

describe("BridgeTokenRepository Layerswap discovery", () => {
  const STARKNET_ETH_ADDRESS =
    "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
  const STARKNET_USDC_ADDRESS =
    "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8";

  function lsToken(overrides: Partial<LsToken> & { symbol: string }): LsToken {
    return {
      logo: "https://example.com/logo.png",
      contract: null,
      decimals: 18,
      price_in_usd: 0,
      precision: 6,
      listing_date: "2024-01-01T00:00:00Z",
      ...overrides,
    };
  }

  function lsRoute(name: string, tokens: LsToken[]): LsRoute {
    return {
      name,
      display_name: name,
      logo: "https://example.com/network.png",
      chain_id: "1",
      type: name.startsWith("SOLANA") ? "solana" : "evm",
      transaction_explorer_template: "https://example.com/tx/{0}",
      account_explorer_template: "https://example.com/account/{0}",
      tokens,
    };
  }

  function emptyStarkgateFetch() {
    return vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => [],
    }) as unknown as typeof fetch;
  }

  it("discovers and merges Layerswap tokens, joining external and Starknet sides by symbol", async () => {
    const layerswapApi: LayerswapTokenSource = {
      getSources: vi.fn().mockResolvedValue([
        lsRoute("ETHEREUM_SEPOLIA", [
          lsToken({ symbol: "ETH", contract: null, decimals: 18 }),
          lsToken({
            symbol: "USDC",
            contract: "0x2222222222222222222222222222222222222222",
            decimals: 6,
          }),
        ]),
      ]),
      getDestinations: vi.fn().mockResolvedValue([
        lsRoute("STARKNET_SEPOLIA", [
          lsToken({ symbol: "ETH", contract: STARKNET_ETH_ADDRESS }),
          lsToken({
            symbol: "USDC",
            contract: STARKNET_USDC_ADDRESS,
            decimals: 6,
          }),
        ]),
      ]),
    };

    const repository = new BridgeTokenRepository({
      fetchFn: emptyStarkgateFetch(),
      layerswapApi,
    });

    const tokens = await repository.getTokens({
      env: "testnet",
      chain: ExternalChain.ETHEREUM,
    });

    expect(layerswapApi.getSources).toHaveBeenCalledWith({
      destinationNetwork: "STARKNET_SEPOLIA",
      networkTypes: ["evm"],
    });
    expect(layerswapApi.getDestinations).toHaveBeenCalledWith({
      sourceNetwork: "ETHEREUM_SEPOLIA",
    });

    expect(tokens).toHaveLength(2);
    const eth = tokens.find((t) => t.symbol === "ETH");
    expect(eth).toBeInstanceOf(EthereumBridgeToken);
    expect(eth).not.toBeInstanceOf(ContractRoutedEthereumBridgeToken);
    expect(eth?.protocol).toBe(Protocol.LAYERSWAP);
    expect(eth?.id).toBe("eth-ethereum-layerswap");
    // Native ETH (null contract) maps to the zero-address marker.
    expect(eth?.address).toBe("0x0000000000000000000000000000000000000000");
    expect(eth?.starknetAddress).toBe(STARKNET_ETH_ADDRESS);

    const usdc = tokens.find((t) => t.symbol === "USDC");
    expect(usdc?.address).toBe("0x2222222222222222222222222222222222222222");
    expect(usdc?.starknetAddress).toBe(STARKNET_USDC_ADDRESS);
  });

  it("discovers Solana Layerswap tokens with the native SOL marker", async () => {
    const layerswapApi: LayerswapTokenSource = {
      getSources: vi
        .fn()
        .mockResolvedValue([
          lsRoute("SOLANA_MAINNET", [
            lsToken({ symbol: "SOL", contract: null, decimals: 9 }),
          ]),
        ]),
      getDestinations: vi.fn().mockResolvedValue([
        lsRoute("STARKNET_MAINNET", [
          lsToken({
            symbol: "SOL",
            contract: STARKNET_ETH_ADDRESS,
            decimals: 9,
          }),
        ]),
      ]),
    };

    const repository = new BridgeTokenRepository({
      fetchFn: emptyStarkgateFetch(),
      layerswapApi,
    });

    const tokens = await repository.getTokens({
      env: "mainnet",
      chain: ExternalChain.SOLANA,
    });

    expect(layerswapApi.getSources).toHaveBeenCalledWith({
      destinationNetwork: "STARKNET_MAINNET",
      networkTypes: ["solana"],
    });
    expect(tokens).toHaveLength(1);
    const sol = tokens[0];
    expect(sol).toBeInstanceOf(SolanaBridgeToken);
    expect(sol?.protocol).toBe(Protocol.LAYERSWAP);
    expect(sol?.address).toBe("11111111111111111111111111111111");
  });

  it("joins external and Starknet sides case-insensitively by symbol", async () => {
    // The two API sides report the same asset with different casing.
    const layerswapApi: LayerswapTokenSource = {
      getSources: vi
        .fn()
        .mockResolvedValue([
          lsRoute("ETHEREUM_MAINNET", [
            lsToken({ symbol: "ETH", contract: null, decimals: 18 }),
          ]),
        ]),
      getDestinations: vi
        .fn()
        .mockResolvedValue([
          lsRoute("STARKNET_MAINNET", [
            lsToken({ symbol: "eth", contract: STARKNET_ETH_ADDRESS }),
          ]),
        ]),
    };

    const repository = new BridgeTokenRepository({
      fetchFn: emptyStarkgateFetch(),
      layerswapApi,
    });

    const tokens = await repository.getTokens({
      env: "mainnet",
      chain: ExternalChain.ETHEREUM,
    });

    // The casing mismatch must not drop the pair; the external symbol/id wins.
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.symbol).toBe("ETH");
    expect(tokens[0]?.id).toBe("eth-ethereum-layerswap");
    expect(tokens[0]?.starknetAddress).toBe(STARKNET_ETH_ADDRESS);
  });

  it("builds a discovery client from layerswapApiKey and sends the API key", async () => {
    // The real (non-injected) path: discovery hits Layerswap's route endpoints
    // via global fetch. The key is environment-scoped (separate mainnet/testnet
    // keys), so discovery must send it to resolve routes for the right network.
    const headersSeen: HeadersInit[] = [];
    const lsFetch = vi.fn(async (url: string, init?: RequestInit) => {
      headersSeen.push(init?.headers ?? {});
      const data = url.includes("/sources")
        ? [
            lsRoute("ETHEREUM_MAINNET", [
              lsToken({ symbol: "ETH", contract: null, decimals: 18 }),
            ]),
          ]
        : [
            lsRoute("STARKNET_MAINNET", [
              lsToken({ symbol: "ETH", contract: STARKNET_ETH_ADDRESS }),
            ]),
          ];
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ data, error: null }),
      };
    });
    vi.stubGlobal("fetch", lsFetch);

    try {
      const repository = new BridgeTokenRepository({
        fetchFn: emptyStarkgateFetch(),
        layerswapApiKey: "secret-key",
      });

      const tokens = await repository.getTokens({
        env: "mainnet",
        chain: ExternalChain.ETHEREUM,
      });

      expect(tokens).toHaveLength(1);
      expect(tokens[0]?.symbol).toBe("ETH");
      expect(headersSeen.length).toBeGreaterThan(0);
      for (const headers of headersSeen) {
        expect((headers as Record<string, string>)["X-LS-APIKEY"]).toBe(
          "secret-key"
        );
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not discover Layerswap tokens when no source is configured", async () => {
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

    // Identical to the StarkGate-only result: no Layerswap tokens added.
    expect(tokens).toHaveLength(3);
    expect(tokens.some((t) => t.protocol === Protocol.LAYERSWAP)).toBe(false);
  });

  it("does not discover Layerswap tokens with only a base URL (bridging needs the API key)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => mockApiResponse(),
    });

    const repository = new BridgeTokenRepository({
      fetchFn: fetchMock as unknown as typeof fetch,
      layerswapBaseUrl: "https://layerswap.example.com",
    });
    const tokens = await repository.getTokens();

    // Without a key the SDK cannot bridge via Layerswap, so it must not
    // advertise Layerswap tokens either.
    expect(tokens.some((t) => t.protocol === Protocol.LAYERSWAP)).toBe(false);
  });

  it("coexists with StarkGate tokens, and discovered tokens win over any layerswap rows StarkGate serves", async () => {
    // StarkGate serves canonical ETH (a distinct route that must survive) and
    // a layerswap USDC row — which is ignored, since the Layerswap API is the
    // sole source of layerswap tokens.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => [
        {
          id: "eth",
          chain: "ethereum",
          protocol: "canonical",
          name: "Ethereum",
          symbol: "ETH",
          decimals: 18,
          l1_token_address: "0x0000000000000000000000000000000000000000",
          l2_token_address: STARKNET_ETH_ADDRESS,
          l1_bridge_address: "0x1111111111111111111111111111111111111111",
          l2_bridge_address:
            "0x073314940630fd6dcda0d772d4c972c4e0a9946bef9dabf4ef84eda8ef542b82",
        },
        {
          id: "usdc-layerswap-starkgate",
          chain: "ethereum",
          protocol: "layerswap",
          name: "USD Coin",
          symbol: "USDC",
          decimals: 6,
          l1_token_address: "0x4444444444444444444444444444444444444444",
          l2_token_address: STARKNET_USDC_ADDRESS,
        },
      ],
    });

    const layerswapApi: LayerswapTokenSource = {
      getSources: vi.fn().mockResolvedValue([
        lsRoute("ETHEREUM_MAINNET", [
          lsToken({ symbol: "ETH", contract: null }),
          lsToken({
            symbol: "USDC",
            contract: "0x2222222222222222222222222222222222222222",
            decimals: 6,
          }),
        ]),
      ]),
      getDestinations: vi.fn().mockResolvedValue([
        lsRoute("STARKNET_MAINNET", [
          lsToken({ symbol: "ETH", contract: STARKNET_ETH_ADDRESS }),
          lsToken({
            symbol: "USDC",
            contract: STARKNET_USDC_ADDRESS,
            decimals: 6,
          }),
        ]),
      ]),
    };

    const repository = new BridgeTokenRepository({
      fetchFn: fetchMock as unknown as typeof fetch,
      layerswapApi,
    });

    const tokens = await repository.getTokens({
      env: "mainnet",
      chain: ExternalChain.ETHEREUM,
    });

    // Different protocols are distinct routes: canonical ETH AND Layerswap ETH
    // both survive.
    const ethTokens = tokens.filter((t) => t.symbol === "ETH");
    expect(ethTokens.map((t) => t.protocol).sort()).toEqual([
      Protocol.CANONICAL,
      Protocol.LAYERSWAP,
    ]);

    // StarkGate's layerswap USDC row is ignored; the discovered token is the
    // only layerswap USDC and carries the Layerswap-reported address.
    const usdcTokens = tokens.filter((t) => t.symbol === "USDC");
    expect(usdcTokens).toHaveLength(1);
    expect(usdcTokens[0]?.protocol).toBe(Protocol.LAYERSWAP);
    expect(usdcTokens[0]?.address).toBe(
      "0x2222222222222222222222222222222222222222"
    );
  });

  it("gives same-symbol tokens on different chains distinct, chain-qualified ids", async () => {
    const layerswapApi: LayerswapTokenSource = {
      getSources: vi.fn().mockResolvedValue([
        lsRoute("ETHEREUM_MAINNET", [
          lsToken({
            symbol: "USDC",
            contract: "0x2222222222222222222222222222222222222222",
            decimals: 6,
          }),
        ]),
        lsRoute("SOLANA_MAINNET", [
          lsToken({
            symbol: "USDC",
            contract: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            decimals: 6,
          }),
        ]),
      ]),
      getDestinations: vi.fn().mockResolvedValue([
        lsRoute("STARKNET_MAINNET", [
          lsToken({
            symbol: "USDC",
            contract: STARKNET_USDC_ADDRESS,
            decimals: 6,
          }),
        ]),
      ]),
    };

    const repository = new BridgeTokenRepository({
      fetchFn: emptyStarkgateFetch(),
      layerswapApi,
    });

    const tokens = await repository.getTokens({ env: "mainnet" });

    expect(tokens.map((t) => t.id).sort()).toEqual([
      "usdc-ethereum-layerswap",
      "usdc-solana-layerswap",
    ]);
  });

  it("skips tokens whose symbol is ambiguous on the Starknet side instead of guessing a contract", async () => {
    const layerswapApi: LayerswapTokenSource = {
      getSources: vi.fn().mockResolvedValue([
        lsRoute("ETHEREUM_MAINNET", [
          lsToken({ symbol: "ETH", contract: null }),
          lsToken({
            symbol: "USDC",
            contract: "0x2222222222222222222222222222222222222222",
            decimals: 6,
          }),
        ]),
      ]),
      getDestinations: vi.fn().mockResolvedValue([
        lsRoute("STARKNET_MAINNET", [
          lsToken({ symbol: "ETH", contract: STARKNET_ETH_ADDRESS }),
          // Two Starknet-side tokens share the USDC symbol (e.g. native USDC
          // and bridged USDC.e) — the symbol join cannot pick one safely.
          lsToken({ symbol: "USDC", contract: STARKNET_USDC_ADDRESS }),
          lsToken({
            symbol: "USDC",
            contract:
              "0x0512feac6339ff7889822cb5aa2a86c848e9d392bb0e3e237c008674feed8343",
          }),
        ]),
      ]),
    };
    const mockLogger = createMockLogger().install();

    const repository = new BridgeTokenRepository({
      fetchFn: emptyStarkgateFetch(),
      layerswapApi,
      logger: mockLogger.instance,
    });

    const tokens = await repository.getTokens({
      env: "mainnet",
      chain: ExternalChain.ETHEREUM,
    });

    expect(tokens.map((t) => t.symbol)).toEqual(["ETH"]);
    expect(mockLogger.spies.warn).toHaveBeenCalledWith(
      "[starkzap] Skipping Layerswap token USDC: multiple STARKNET_MAINNET tokens share the symbol."
    );
  });

  it("degrades gracefully when Layerswap discovery fails", async () => {
    const layerswapApi: LayerswapTokenSource = {
      getSources: vi.fn().mockRejectedValue(new Error("network down")),
      getDestinations: vi.fn().mockResolvedValue([]),
    };
    const mockLogger = createMockLogger().install();

    const repository = new BridgeTokenRepository({
      fetchFn: emptyStarkgateFetch(),
      layerswapApi,
      logger: mockLogger.instance,
    });

    const tokens = await repository.getTokens({
      env: "testnet",
      chain: ExternalChain.ETHEREUM,
    });

    // StarkGate result (empty here) is preserved; failure is logged, not thrown.
    expect(tokens).toHaveLength(0);
    expect(mockLogger.spies.warn).toHaveBeenCalledWith(
      "[starkzap] Skipping Layerswap ethereum token discovery due to",
      expect.any(Error)
    );
  });

  it("skips tokens whose decimals differ between the external and Starknet sides", async () => {
    const layerswapApi: LayerswapTokenSource = {
      getSources: vi.fn().mockResolvedValue([
        lsRoute("ETHEREUM_MAINNET", [
          lsToken({ symbol: "ETH", contract: null, decimals: 18 }),
          lsToken({
            symbol: "USDC",
            contract: "0x2222222222222222222222222222222222222222",
            decimals: 6,
          }),
        ]),
      ]),
      getDestinations: vi.fn().mockResolvedValue([
        lsRoute("STARKNET_MAINNET", [
          lsToken({
            symbol: "ETH",
            contract: STARKNET_ETH_ADDRESS,
            decimals: 18,
          }),
          // A single decimals value drives Starknet-side amount math, so a
          // mismatched pair would mis-scale amounts by 10^diff.
          lsToken({
            symbol: "USDC",
            contract: STARKNET_USDC_ADDRESS,
            decimals: 8,
          }),
        ]),
      ]),
    };
    const mockLogger = createMockLogger().install();

    const repository = new BridgeTokenRepository({
      fetchFn: emptyStarkgateFetch(),
      layerswapApi,
      logger: mockLogger.instance,
    });

    const tokens = await repository.getTokens({
      env: "mainnet",
      chain: ExternalChain.ETHEREUM,
    });

    expect(tokens.map((t) => t.symbol)).toEqual(["ETH"]);
    expect(mockLogger.spies.warn).toHaveBeenCalledWith(
      "[starkzap] Skipping Layerswap token USDC: decimals differ between ETHEREUM_MAINNET (6) and STARKNET_MAINNET (8)."
    );
  });

  it("caches a transiently degraded discovery only briefly, then retries", async () => {
    let now = 0;
    const layerswapApi: LayerswapTokenSource = {
      getSources: vi
        .fn()
        .mockRejectedValueOnce(new Error("network down"))
        .mockResolvedValue([
          lsRoute("ETHEREUM_MAINNET", [
            lsToken({ symbol: "ETH", contract: null, decimals: 18 }),
          ]),
        ]),
      getDestinations: vi
        .fn()
        .mockResolvedValue([
          lsRoute("STARKNET_MAINNET", [
            lsToken({ symbol: "ETH", contract: STARKNET_ETH_ADDRESS }),
          ]),
        ]),
    };

    const repository = new BridgeTokenRepository({
      fetchFn: emptyStarkgateFetch(),
      layerswapApi,
      now: () => now,
    });
    const query = { env: "mainnet", chain: ExternalChain.ETHEREUM } as const;

    expect(await repository.getTokens(query)).toHaveLength(0);

    // Still within the degraded TTL: the empty result is served from cache.
    now = LAYERSWAP_DEGRADED_CACHE_TTL_MS - 1;
    expect(await repository.getTokens(query)).toHaveLength(0);
    expect(layerswapApi.getSources).toHaveBeenCalledTimes(1);

    // Degraded TTL elapsed (well before the full TTL): discovery retries and
    // the recovered Layerswap tokens reappear.
    now = LAYERSWAP_DEGRADED_CACHE_TTL_MS;
    const recovered = await repository.getTokens(query);
    expect(recovered.map((t) => t.symbol)).toEqual(["ETH"]);
    expect(layerswapApi.getSources).toHaveBeenCalledTimes(2);

    // The successful result is cached at the full TTL again.
    now += BRIDGE_TOKEN_CACHE_TTL_MS - 1;
    await repository.getTokens(query);
    expect(layerswapApi.getSources).toHaveBeenCalledTimes(2);
  });
});
