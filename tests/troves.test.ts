import { describe, expect, it, vi } from "vitest";
import type { Call } from "starknet";
import type { RpcProvider } from "starknet";
import {
  Amount,
  ChainId,
  fromAddress,
  type Address,
  type ExecuteOptions,
} from "@/types";
import { Troves } from "@/troves";
import { Tx } from "@/tx";
import type { WalletInterface } from "@/wallet/interface";

const MOCK_ADDRESS =
  "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function createMockWallet(chainId: ChainId = ChainId.MAINNET) {
  const execute =
    vi.fn<(calls: Call[], options?: ExecuteOptions) => Promise<Tx>>();
  execute.mockResolvedValue(
    new Tx("0xmocktxhash", {} as RpcProvider, ChainId.MAINNET)
  );
  const callContract = vi.fn<(call: Call) => Promise<string[]>>();

  return {
    address: fromAddress(MOCK_ADDRESS),
    execute,
    getChainId: () => chainId,
    callContract,
  } satisfies Pick<
    WalletInterface,
    "address" | "execute" | "getChainId" | "callContract"
  >;
}

describe("Troves", () => {
  describe("constructor", () => {
    it("should default to the mainnet API base", async () => {
      const wallet = createMockWallet();
      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ tvl: 0, lastUpdated: "" }),
      });
      const troves = new Troves(wallet, { fetcher: fetcher as typeof fetch });
      await troves.getStats();
      expect(fetcher).toHaveBeenCalledWith(
        "https://app.troves.fi/api/stats",
        expect.any(Object)
      );
    });

    it("should throw on Sepolia without an apiBase override", () => {
      const wallet = createMockWallet(ChainId.SEPOLIA);
      expect(() => new Troves(wallet)).toThrow(
        /Troves only supports Starknet Mainnet/
      );
    });

    it("should accept Sepolia when apiBase is provided", async () => {
      const wallet = createMockWallet(ChainId.SEPOLIA);
      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ tvl: 0, lastUpdated: "" }),
      });
      const troves = new Troves(wallet, {
        fetcher: fetcher as typeof fetch,
        apiBase: "https://staging.troves.fi",
      });
      await troves.getStats();
      expect(fetcher).toHaveBeenCalledWith(
        "https://staging.troves.fi/api/stats",
        expect.any(Object)
      );
    });

    it("should strip a trailing slash from apiBase to avoid double slashes", async () => {
      const wallet = createMockWallet();
      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ tvl: 0, lastUpdated: "" }),
      });
      const troves = new Troves(wallet, {
        fetcher: fetcher as typeof fetch,
        apiBase: "https://staging.troves.fi/",
      });
      await troves.getStats();
      expect(fetcher).toHaveBeenCalledWith(
        "https://staging.troves.fi/api/stats",
        expect.any(Object)
      );
    });

    it("should reject invalid apiBase URLs", () => {
      const wallet = createMockWallet();
      expect(() => new Troves(wallet, { apiBase: "not-a-url" })).toThrow();
    });

    it("should reject non-http(s) apiBase URLs", () => {
      const wallet = createMockWallet();
      expect(
        () => new Troves(wallet, { apiBase: "ftp://staging.troves.fi" })
      ).toThrow();
    });
  });

  describe("getStrategies", () => {
    it("should fetch strategies from API", async () => {
      const wallet = createMockWallet();
      const strategiesResponse = {
        status: true,
        lastUpdated: new Date().toISOString(),
        source: "database",
        strategies: [
          {
            id: "evergreen_strk",
            name: "Evergreen STRK",
            apy: 0.05,
            apySplit: { baseApy: 0.04, rewardsApy: 0.01 },
            depositToken: [
              {
                symbol: "STRK",
                name: "Starknet",
                address: "0x123",
                decimals: 18,
              },
            ],
            leverage: 1,
            contract: [{ name: "Vault", address: "0xabc" }],
            tvlUsd: 1000000,
            status: { number: 1, value: "active" },
            riskFactor: 0.5,
            isAudited: true,
            assets: ["strk"],
            protocols: ["evergreen"],
            isRetired: false,
          },
        ],
      };

      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(strategiesResponse),
      });

      const troves = new Troves(wallet, {
        fetcher: fetcher as typeof fetch,
      });

      const result = await troves.getStrategies();

      expect(fetcher).toHaveBeenCalledWith(
        "https://app.troves.fi/api/strategies",
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
      expect(result.status).toBe(true);
      expect(result.strategies).toHaveLength(1);
      expect(result.strategies[0]?.id).toBe("evergreen_strk");
      expect(result.strategies[0]?.depositTokens[0]?.address).toBe(
        fromAddress("0x123")
      );
      expect(result.strategies[0]?.contracts[0]?.address).toBe(
        fromAddress("0xabc")
      );
    });

    it("should accept discontinuationInfo.date = null", async () => {
      const wallet = createMockWallet();
      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: true,
            lastUpdated: new Date().toISOString(),
            source: "sdk",
            strategies: [
              {
                id: "s1",
                name: "S1",
                apy: 0.05,
                apySplit: { baseApy: 0.04, rewardsApy: 0.01 },
                depositToken: [
                  {
                    symbol: "STRK",
                    name: "Starknet",
                    address: "0x123",
                    decimals: 18,
                  },
                ],
                leverage: 1,
                contract: [{ name: "Vault", address: "0xabc" }],
                tvlUsd: 1000000,
                status: { number: 1, value: "active" },
                riskFactor: 0.5,
                isAudited: true,
                assets: ["strk"],
                protocols: ["evergreen"],
                isRetired: false,
                discontinuationInfo: { date: null },
              },
            ],
          }),
      });

      const troves = new Troves(wallet, { fetcher: fetcher as typeof fetch });
      await expect(troves.getStrategies()).resolves.toBeDefined();
    });

    it("should throw on invalid discontinuationInfo.date string", async () => {
      const wallet = createMockWallet();
      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: true,
            lastUpdated: new Date().toISOString(),
            source: "sdk",
            strategies: [
              {
                id: "s1",
                name: "S1",
                apy: 0.05,
                apySplit: { baseApy: 0.04, rewardsApy: 0.01 },
                depositToken: [
                  {
                    symbol: "STRK",
                    name: "Starknet",
                    address: "0x123",
                    decimals: 18,
                  },
                ],
                leverage: 1,
                contract: [{ name: "Vault", address: "0xabc" }],
                tvlUsd: 1000000,
                status: { number: 1, value: "active" },
                riskFactor: 0.5,
                isAudited: true,
                assets: ["strk"],
                protocols: ["evergreen"],
                isRetired: false,
                discontinuationInfo: { date: "not-a-date" },
              },
            ],
          }),
      });

      const troves = new Troves(wallet, { fetcher: fetcher as typeof fetch });
      await expect(troves.getStrategies()).rejects.toThrow(
        'Troves API returned invalid discontinuationInfo.date for strategy "s1"'
      );
    });

    it("should normalize apy when API returns it as a string", async () => {
      const wallet = createMockWallet();
      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: true,
            lastUpdated: new Date().toISOString(),
            source: "sdk",
            strategies: [
              {
                id: "s1",
                name: "S1",
                apy: "0.0537",
                apySplit: { baseApy: 0.04, rewardsApy: 0.01 },
                depositToken: [
                  {
                    symbol: "STRK",
                    name: "Starknet",
                    address: "0x123",
                    decimals: 18,
                  },
                ],
                leverage: 1,
                contract: [{ name: "Vault", address: "0xabc" }],
                tvlUsd: 1000000,
                status: { number: 1, value: "active" },
                riskFactor: 0.5,
                isAudited: true,
                assets: ["strk"],
                protocols: ["evergreen"],
                isRetired: false,
              },
            ],
          }),
      });

      const troves = new Troves(wallet, { fetcher: fetcher as typeof fetch });
      const result = await troves.getStrategies();
      expect(result.strategies[0]?.apy).toBe(0.0537);
    });

    it("should preserve marketing label apy strings like '🤙YOLO'", async () => {
      const wallet = createMockWallet();
      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: true,
            lastUpdated: new Date().toISOString(),
            source: "sdk",
            strategies: [
              {
                id: "s1",
                name: "S1",
                apy: "🤙YOLO",
                apySplit: { baseApy: 0, rewardsApy: 0 },
                depositToken: [
                  {
                    symbol: "STRK",
                    name: "Starknet",
                    address: "0x123",
                    decimals: 18,
                  },
                ],
                leverage: 1,
                contract: [{ name: "Vault", address: "0xabc" }],
                tvlUsd: 1000000,
                status: { number: 1, value: "active" },
                riskFactor: 0.5,
                isAudited: true,
                assets: ["strk"],
                protocols: ["evergreen"],
                isRetired: false,
              },
            ],
          }),
      });

      const troves = new Troves(wallet, { fetcher: fetcher as typeof fetch });
      const result = await troves.getStrategies();
      expect(result.strategies[0]?.apy).toBe("🤙YOLO");
    });

    it("should preserve empty apy strings", async () => {
      const wallet = createMockWallet();
      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: true,
            lastUpdated: new Date().toISOString(),
            source: "sdk",
            strategies: [
              {
                id: "s1",
                name: "S1",
                apy: "",
                apySplit: { baseApy: 0, rewardsApy: 0 },
                depositToken: [
                  {
                    symbol: "STRK",
                    name: "Starknet",
                    address: "0x123",
                    decimals: 18,
                  },
                ],
                leverage: 1,
                contract: [{ name: "Vault", address: "0xabc" }],
                tvlUsd: 1000000,
                status: { number: 1, value: "active" },
                riskFactor: 0.5,
                isAudited: true,
                assets: ["strk"],
                protocols: ["evergreen"],
                isRetired: false,
              },
            ],
          }),
      });

      const troves = new Troves(wallet, { fetcher: fetcher as typeof fetch });
      const result = await troves.getStrategies();
      expect(result.strategies[0]?.apy).toBe("");
    });

    it("should append no_cache=true when requested", async () => {
      const wallet = createMockWallet();
      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: true,
            lastUpdated: new Date().toISOString(),
            source: "sdk",
            strategies: [],
          }),
      });

      const troves = new Troves(wallet, {
        fetcher: fetcher as typeof fetch,
      });

      await troves.getStrategies({ noCache: true });

      expect(fetcher).toHaveBeenCalledWith(
        "https://app.troves.fi/api/strategies?no_cache=true",
        expect.any(Object)
      );
    });

    it("should throw when API returns non-ok", async () => {
      const wallet = createMockWallet();
      const fetcher = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      const troves = new Troves(wallet, {
        fetcher: fetcher as typeof fetch,
      });

      await expect(troves.getStrategies()).rejects.toThrow(
        "Troves API failed: 500 Internal Server Error"
      );
    });
  });

  describe("getStats", () => {
    it("should fetch stats from API", async () => {
      const wallet = createMockWallet();
      const statsResponse = {
        tvl: 5000000,
        lastUpdated: new Date().toISOString(),
      };

      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(statsResponse),
      });

      const troves = new Troves(wallet, {
        fetcher: fetcher as typeof fetch,
      });

      const result = await troves.getStats();

      expect(fetcher).toHaveBeenCalledWith(
        "https://app.troves.fi/api/stats",
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
      expect(result.tvl).toBe(5000000);
    });
  });

  describe("populateDepositCalls", () => {
    it("should call execute with normalized deposit calls", async () => {
      const wallet = createMockWallet();
      const depositCallsResponse = {
        success: true,
        results: [
          {
            tokenInfo: {
              symbol: "STRK",
              name: "Starknet",
              address: "0x123",
              decimals: 18,
            },
            calls: [
              {
                contractAddress: "0xabc",
                entrypoint: "approve",
                calldata: ["0xdef", "1000000000000000000"],
              },
              {
                contractAddress: "0xdef",
                entrypoint: "deposit",
                calldata: ["1000000000000000000", MOCK_ADDRESS],
              },
            ],
          },
        ],
        strategyId: "evergreen_strk",
        isDeposit: true,
      };

      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(depositCallsResponse),
      });

      const troves = new Troves(wallet, {
        fetcher: fetcher as typeof fetch,
      });

      const calls = await troves.populateDepositCalls({
        strategyId: "evergreen_strk",
        amountRaw: "1000000000000000000",
      });

      expect(fetcher).toHaveBeenCalledWith(
        "https://app.troves.fi/api/deposits/calls",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            strategyId: "evergreen_strk",
            amountRaw: "1000000000000000000",
            isDeposit: true,
            address: MOCK_ADDRESS,
          }),
        })
      );
      expect(calls).toHaveLength(2);
      expect(calls[0]).toEqual({
        contractAddress: fromAddress("0xabc"),
        entrypoint: "approve",
        calldata: ["0xdef", "1000000000000000000"],
      });
      expect(calls[1]).toEqual({
        contractAddress: fromAddress("0xdef"),
        entrypoint: "deposit",
        calldata: ["1000000000000000000", MOCK_ADDRESS],
      });
    });

    it("should forward amount2Raw and address override", async () => {
      const wallet = createMockWallet();
      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            results: [
              {
                tokenInfo: {
                  symbol: "STRK",
                  name: "Starknet",
                  address: "0x123",
                  decimals: 18,
                },
                calls: [
                  {
                    contractAddress: "0xabc",
                    entrypoint: "approve",
                    calldata: ["0xdef", "1"],
                  },
                ],
              },
            ],
            strategyId: "s1",
            isDeposit: true,
          }),
      });

      const overrideAddress = fromAddress("0xdead");
      const troves = new Troves(wallet, { fetcher: fetcher as typeof fetch });
      await troves.populateDepositCalls({
        strategyId: "s1",
        amountRaw: "1",
        amount2Raw: "2",
        address: overrideAddress,
      });

      expect(fetcher).toHaveBeenCalledWith(
        "https://app.troves.fi/api/deposits/calls",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            strategyId: "s1",
            amountRaw: "1",
            amount2Raw: "2",
            isDeposit: true,
            address: overrideAddress,
          }),
        })
      );
    });

    it("should throw when API returns no calls", async () => {
      const wallet = createMockWallet();
      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            results: [],
            strategyId: "evergreen_strk",
            isDeposit: true,
          }),
      });

      const troves = new Troves(wallet, {
        fetcher: fetcher as typeof fetch,
      });

      await expect(
        troves.populateDepositCalls({
          strategyId: "evergreen_strk",
          amountRaw: "1000000000000000000",
        })
      ).rejects.toThrow(
        'Troves deposit API returned no calls for strategy "evergreen_strk"'
      );
    });

    it("should throw when API returns results with empty calls after flattening", async () => {
      const wallet = createMockWallet();
      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            results: [
              {
                tokenInfo: {
                  symbol: "STRK",
                  name: "Starknet",
                  address: "0x123",
                  decimals: 18,
                },
                calls: [],
              },
            ],
            strategyId: "evergreen_strk",
            isDeposit: true,
          }),
      });

      const troves = new Troves(wallet, {
        fetcher: fetcher as typeof fetch,
      });

      await expect(
        troves.populateDepositCalls({
          strategyId: "evergreen_strk",
          amountRaw: "1000000000000000000",
        })
      ).rejects.toThrow(
        'Troves deposit API returned results with no calls for strategy "evergreen_strk"'
      );
    });
  });

  describe("populateWithdrawCalls", () => {
    it("should call API with isDeposit=false and return normalized calls", async () => {
      const wallet = createMockWallet();
      const withdrawCallsResponse = {
        success: true,
        results: [
          {
            tokenInfo: {
              symbol: "STRK",
              name: "Starknet",
              address: "0x123",
              decimals: 18,
            },
            calls: [
              {
                contractAddress: "0xdef",
                entrypoint: "redeem",
                calldata: ["1000000000000000000", MOCK_ADDRESS, MOCK_ADDRESS],
              },
            ],
          },
        ],
        strategyId: "evergreen_strk",
        isDeposit: false,
      };

      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(withdrawCallsResponse),
      });

      const troves = new Troves(wallet, {
        fetcher: fetcher as typeof fetch,
      });

      const calls = await troves.populateWithdrawCalls({
        strategyId: "evergreen_strk",
        amountRaw: "1000000000000000000",
      });

      expect(fetcher).toHaveBeenCalledWith(
        "https://app.troves.fi/api/deposits/calls",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            strategyId: "evergreen_strk",
            amountRaw: "1000000000000000000",
            isDeposit: false,
            address: MOCK_ADDRESS,
          }),
        })
      );
      expect(calls).toHaveLength(1);
      expect(calls[0]?.entrypoint).toBe("redeem");
    });

    it("should throw when API returns results with empty calls after flattening", async () => {
      const wallet = createMockWallet();
      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            results: [
              {
                tokenInfo: {
                  symbol: "STRK",
                  name: "Starknet",
                  address: "0x123",
                  decimals: 18,
                },
                calls: [],
              },
            ],
            strategyId: "evergreen_strk",
            isDeposit: false,
          }),
      });

      const troves = new Troves(wallet, {
        fetcher: fetcher as typeof fetch,
      });

      await expect(
        troves.populateWithdrawCalls({
          strategyId: "evergreen_strk",
          amountRaw: "1000000000000000000",
        })
      ).rejects.toThrow(
        'Troves withdraw API returned results with no calls for strategy "evergreen_strk"'
      );
    });
  });

  describe("deposit", () => {
    it("should call execute with approve and deposit calls", async () => {
      const wallet = createMockWallet();
      const depositCallsResponse = {
        success: true,
        results: [
          {
            tokenInfo: {
              symbol: "STRK",
              name: "Starknet",
              address: "0x123",
              decimals: 18,
            },
            calls: [
              {
                contractAddress: "0xabc",
                entrypoint: "approve",
                calldata: ["0xdef", "1000000000000000000"],
              },
              {
                contractAddress: "0xdef",
                entrypoint: "deposit",
                calldata: ["1000000000000000000", MOCK_ADDRESS],
              },
            ],
          },
        ],
        strategyId: "evergreen_strk",
        isDeposit: true,
      };

      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(depositCallsResponse),
      });

      const troves = new Troves(wallet, {
        fetcher: fetcher as typeof fetch,
      });

      const tx = await troves.deposit(
        {
          strategyId: "evergreen_strk",
          amount: Amount.fromRaw(1000000000000000000n, 18, "STRK"),
        },
        {}
      );

      expect(wallet.execute).toHaveBeenCalledTimes(1);
      const [calls] = (wallet.execute as ReturnType<typeof vi.fn>).mock
        .calls[0]!;
      expect(calls).toHaveLength(2);
      expect(calls[0]?.entrypoint).toBe("approve");
      expect(calls[1]?.entrypoint).toBe("deposit");
      expect(tx.hash).toBe("0xmocktxhash");
    });

    it("should forward amount2 for multi-asset strategies", async () => {
      const wallet = createMockWallet();
      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            results: [
              {
                tokenInfo: {
                  symbol: "STRK",
                  name: "Starknet",
                  address: "0x123",
                  decimals: 18,
                },
                calls: [
                  {
                    contractAddress: "0xabc",
                    entrypoint: "approve",
                    calldata: ["0xdef", "1"],
                  },
                ],
              },
            ],
            strategyId: "lp_strk_usdc",
            isDeposit: true,
          }),
      });

      const troves = new Troves(wallet, { fetcher: fetcher as typeof fetch });
      await troves.deposit({
        strategyId: "lp_strk_usdc",
        amount: Amount.fromRaw(1000000000000000000n, 18, "STRK"),
        amount2: Amount.fromRaw(2000000n, 6, "USDC"),
      });

      expect(fetcher).toHaveBeenCalledWith(
        "https://app.troves.fi/api/deposits/calls",
        expect.objectContaining({
          body: JSON.stringify({
            strategyId: "lp_strk_usdc",
            amountRaw: "1000000000000000000",
            amount2Raw: "2000000",
            isDeposit: true,
            address: MOCK_ADDRESS,
          }),
        })
      );
    });
  });

  describe("withdraw", () => {
    it("should call execute with withdraw calls", async () => {
      const wallet = createMockWallet();
      const withdrawCallsResponse = {
        success: true,
        results: [
          {
            tokenInfo: {
              symbol: "STRK",
              name: "Starknet",
              address: "0x123",
              decimals: 18,
            },
            calls: [
              {
                contractAddress: "0xdef",
                entrypoint: "redeem",
                calldata: ["1000000000000000000", MOCK_ADDRESS, MOCK_ADDRESS],
              },
            ],
          },
        ],
        strategyId: "evergreen_strk",
        isDeposit: false,
      };

      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(withdrawCallsResponse),
      });

      const troves = new Troves(wallet, {
        fetcher: fetcher as typeof fetch,
      });

      const tx = await troves.withdraw(
        {
          strategyId: "evergreen_strk",
          amount: Amount.fromRaw(1000000000000000000n, 18, "STRK"),
        },
        {}
      );

      expect(wallet.execute).toHaveBeenCalledTimes(1);
      const [calls] = (wallet.execute as ReturnType<typeof vi.fn>).mock
        .calls[0]!;
      expect(calls).toHaveLength(1);
      expect(calls[0]?.entrypoint).toBe("redeem");
      expect(tx.hash).toBe("0xmocktxhash");
    });
  });

  describe("getPosition", () => {
    const VAULT = "0xabc";
    const U256 = (value: bigint): [string, string] => [
      (value & ((1n << 128n) - 1n)).toString(),
      (value >> 128n).toString(),
    ];
    const STRK_TOKEN = {
      symbol: "STRK",
      name: "Starknet",
      address: "0x123",
      decimals: 18,
    };
    const USDC_TOKEN = {
      symbol: "USDC",
      name: "USD Coin",
      address: "0x456",
      decimals: 6,
    };
    const BASE_STRATEGY = {
      leverage: 1,
      tvlUsd: 1000000,
      status: { number: 1, value: "active" },
      riskFactor: 0.5,
      isAudited: true,
      protocols: ["evergreen"],
      isRetired: false,
    };

    function fetcherForStrategies(strategies: unknown[]) {
      return vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: true,
            lastUpdated: new Date().toISOString(),
            source: "sdk",
            strategies,
          }),
      });
    }

    it("should return a single-asset position via convert_to_assets u256", async () => {
      const wallet = createMockWallet();
      const shares = 3_000_000_000_000_000_000n; // 3e18
      const assets = 3_750_000_000_000_000_000n; // 3.75e18
      wallet.callContract
        .mockResolvedValueOnce(U256(shares))
        .mockResolvedValueOnce(U256(assets));

      const fetcher = fetcherForStrategies([
        {
          id: "vesu_rebal",
          name: "Vesu Rebalance",
          apy: 0.1,
          apySplit: { baseApy: 0.1, rewardsApy: 0 },
          depositToken: [STRK_TOKEN],
          contract: [{ name: "Vault", address: VAULT }],
          assets: ["strk"],
          ...BASE_STRATEGY,
        },
      ]);

      const troves = new Troves(wallet, { fetcher: fetcher as typeof fetch });
      const pos = await troves.getPosition("vesu_rebal");

      expect(pos).not.toBeNull();
      expect(pos?.strategyId).toBe("vesu_rebal");
      expect(pos?.vaultAddress).toBe(fromAddress(VAULT));
      expect(pos?.shares).toBe(shares);
      expect(pos?.amounts).toHaveLength(1);
      expect(pos?.amounts[0]?.toBase()).toBe(assets);
      expect(pos?.amounts[0]?.getSymbol()).toBe("STRK");

      expect(wallet.callContract).toHaveBeenNthCalledWith(1, {
        contractAddress: fromAddress(VAULT),
        entrypoint: "balance_of",
        calldata: [fromAddress(MOCK_ADDRESS)],
      });
      expect(wallet.callContract).toHaveBeenNthCalledWith(2, {
        contractAddress: fromAddress(VAULT),
        entrypoint: "convert_to_assets",
        calldata: U256(shares),
      });
    });

    it("should return a dual-asset position for CL vaults (MyPosition)", async () => {
      const wallet = createMockWallet();
      const shares = 1_000_000_000_000_000_000n;
      const liquidity = 42_000_000n;
      const amount0 = 5_000_000_000_000_000_000n; // 5 STRK
      const amount1 = 2_500_000n; // 2.5 USDC
      wallet.callContract
        .mockResolvedValueOnce(U256(shares))
        .mockResolvedValueOnce([
          ...U256(liquidity),
          ...U256(amount0),
          ...U256(amount1),
        ]);

      const fetcher = fetcherForStrategies([
        {
          id: "ekubo_cl_strkusdc",
          name: "Ekubo STRK/USDC",
          apy: 0.5,
          apySplit: { baseApy: 0.5, rewardsApy: 0 },
          depositToken: [STRK_TOKEN, USDC_TOKEN],
          contract: [{ name: "Vault", address: VAULT }],
          assets: ["strk", "usdc"],
          ...BASE_STRATEGY,
        },
      ]);

      const troves = new Troves(wallet, { fetcher: fetcher as typeof fetch });
      const pos = await troves.getPosition("ekubo_cl_strkusdc");

      expect(pos?.amounts).toHaveLength(2);
      expect(pos?.amounts[0]?.toBase()).toBe(amount0);
      expect(pos?.amounts[0]?.getSymbol()).toBe("STRK");
      expect(pos?.amounts[1]?.toBase()).toBe(amount1);
      expect(pos?.amounts[1]?.getSymbol()).toBe("USDC");
    });

    it("should return null when the wallet holds no shares", async () => {
      const wallet = createMockWallet();
      wallet.callContract.mockResolvedValueOnce(U256(0n));
      const fetcher = fetcherForStrategies([
        {
          id: "vesu_rebal",
          name: "Vesu Rebalance",
          apy: 0.1,
          apySplit: { baseApy: 0.1, rewardsApy: 0 },
          depositToken: [STRK_TOKEN],
          contract: [{ name: "Vault", address: VAULT }],
          assets: ["strk"],
          ...BASE_STRATEGY,
        },
      ]);

      const troves = new Troves(wallet, { fetcher: fetcher as typeof fetch });
      const pos = await troves.getPosition("vesu_rebal");

      expect(pos).toBeNull();
      // Skipped the convert_to_assets call entirely.
      expect(wallet.callContract).toHaveBeenCalledTimes(1);
    });

    it("should return null for strategies with no Vault contract (e.g. TVA)", async () => {
      const wallet = createMockWallet();
      const fetcher = fetcherForStrategies([
        {
          id: "btc_yolo",
          name: "WBTC YOLO",
          apy: "🤙YOLO",
          apySplit: { baseApy: 0, rewardsApy: 0 },
          depositToken: [STRK_TOKEN],
          contract: [],
          assets: ["wbtc"],
          ...BASE_STRATEGY,
        },
      ]);

      const troves = new Troves(wallet, { fetcher: fetcher as typeof fetch });
      const pos = await troves.getPosition("btc_yolo");

      expect(pos).toBeNull();
      // No on-chain reads attempted.
      expect(wallet.callContract).not.toHaveBeenCalled();
    });

    it("should throw when the strategy id is unknown", async () => {
      const wallet = createMockWallet();
      const fetcher = fetcherForStrategies([]);
      const troves = new Troves(wallet, { fetcher: fetcher as typeof fetch });

      await expect(troves.getPosition("nope")).rejects.toThrow(
        'Troves strategy "nope" not found'
      );
    });

    it("should accept an explicit address override", async () => {
      const wallet = createMockWallet();
      const override = fromAddress("0xdead") as Address;
      wallet.callContract.mockResolvedValueOnce(U256(0n));

      const fetcher = fetcherForStrategies([
        {
          id: "vesu_rebal",
          name: "Vesu Rebalance",
          apy: 0.1,
          apySplit: { baseApy: 0.1, rewardsApy: 0 },
          depositToken: [STRK_TOKEN],
          contract: [{ name: "Vault", address: VAULT }],
          assets: ["strk"],
          ...BASE_STRATEGY,
        },
      ]);

      const troves = new Troves(wallet, { fetcher: fetcher as typeof fetch });
      await troves.getPosition("vesu_rebal", override);

      expect(wallet.callContract).toHaveBeenCalledWith(
        expect.objectContaining({ calldata: [override] })
      );
    });
  });
});
