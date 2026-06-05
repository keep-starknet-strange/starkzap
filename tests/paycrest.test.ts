import { beforeEach, describe, expect, it, vi } from "vitest";
import nodeCrypto from "node:crypto";
import {
  Amount,
  ChainId,
  fromAddress,
  type Address,
  type Token,
} from "@/types";
import { mainnetTokens } from "@/erc20/token/presets";
import {
  Paycrest,
  PAYCREST_GATEWAY_MAINNET,
  PaycrestApi,
  PaycrestApiError,
  PaycrestOfframpExecuteError,
  PaycrestOrderError,
  ORDER_CREATED_EVENT_SELECTOR,
  extractOrderIdFromReceipt,
  STARKNET_MAINNET_CHAIN_ID,
  paycrestGatewayFor,
  paycrestGatewaySessionPolicies,
  paycrestNetworkFor,
} from "@/paycrest";
import type { WalletInterface } from "@/wallet/interface";
import { Erc20 } from "@/erc20";
import { num, type RpcProvider } from "starknet";

const USDC: Token = {
  name: "USDC",
  address:
    "0x033068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb" as Address,
  decimals: 6,
  symbol: "USDC",
};

const SENDER = fromAddress(
  "0x01abcdef0000000000000000000000000000000000000000000000000000abcd"
);

function buildKeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = nodeCrypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKey, privateKey };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function envelope<T>(data: T): { status: string; data: T } {
  return { status: "success", data };
}

function makeFakeWallet(): {
  wallet: WalletInterface;
  executeMock: ReturnType<typeof vi.fn>;
  receiptMock: ReturnType<typeof vi.fn>;
  waitMock: ReturnType<typeof vi.fn>;
} {
  const provider = {} as unknown as RpcProvider;
  const receiptMock = vi.fn().mockResolvedValue({ events: [] });
  const waitMock = vi.fn().mockResolvedValue(undefined);
  const executeMock = vi
    .fn()
    .mockResolvedValue({ hash: "0xtx", receipt: receiptMock, wait: waitMock });
  const erc20Map = new Map<Address, Erc20>();
  const wallet = {
    address: SENDER,
    getChainId: () => ChainId.MAINNET,
    getProvider: () => provider,
    execute: executeMock,
    erc20: (token: Token) => {
      const cached = erc20Map.get(token.address);
      if (cached) return cached;
      const e = new Erc20(token, provider);
      erc20Map.set(token.address, e);
      return e;
    },
  } as unknown as WalletInterface;
  return { wallet, executeMock, receiptMock, waitMock };
}

describe("Paycrest rate scaling (u128, 2 decimals)", () => {
  it("matches the on-chain convention used by EVM Paycrest deployments", async () => {
    const { rateToU128 } = await import("@/paycrest/paycrest");
    // EVM convention: on-chain rate 156000 == 1560.00, 136192 == 1361.92.
    expect(rateToU128("1560")).toBe(156000n);
    expect(rateToU128("1560.00")).toBe(156000n);
    expect(rateToU128("1361.92")).toBe(136192n);
    // Edge cases
    expect(rateToU128("0.01")).toBe(1n);
    expect(rateToU128("1500.5")).toBe(150050n); // missing trailing zero is padded
    expect(rateToU128("1500.50")).toBe(150050n);
    // Surrounding whitespace is tolerated (trimmed) since spaces don't
    // change the numeric value.
    expect(rateToU128("  1500  ")).toBe(150000n);
  });

  it("throws on more than 2 decimal places (no silent truncation)", async () => {
    // Silently slicing would let callers submit a different rate
    // on-chain than the one they fetched/displayed. Throw instead
    // so the caller rounds explicitly upstream.
    const { rateToU128 } = await import("@/paycrest/paycrest");
    expect(() => rateToU128("1361.999")).toThrow(/decimal places/i);
    expect(() => rateToU128("1500.501")).toThrow(/decimal places/i);
  });

  it("rejects negative or non-numeric input rather than coercing", async () => {
    // The old lenient stripper turned "-1.23" into "1.23" — a
    // materially different on-chain rate. Reject those inputs so the
    // bug surfaces at the validation layer instead of as a wrong order.
    const { rateToU128 } = await import("@/paycrest/paycrest");
    expect(() => rateToU128("-1.23")).toThrow(/not a valid/i);
    expect(() => rateToU128("$1500")).toThrow(/not a valid/i);
    expect(() => rateToU128("1.2e3")).toThrow(/not a valid/i);
    expect(() => rateToU128("")).toThrow(/not a valid/i);
  });
});

describe("Paycrest presets", () => {
  it("maps mainnet ChainId to the live Cairo Gateway address", () => {
    expect(paycrestGatewayFor(ChainId.MAINNET)).toBe(PAYCREST_GATEWAY_MAINNET);
    expect(paycrestNetworkFor(ChainId.MAINNET)).toBe("starknet");
  });

  it("rejects sepolia (Paycrest is mainnet-only)", () => {
    expect(() => paycrestGatewayFor(ChainId.SEPOLIA)).toThrow(/mainnet-only/i);
    expect(() => paycrestNetworkFor(ChainId.SEPOLIA)).toThrow(/mainnet-only/i);
  });
});

describe("PaycrestApi", () => {
  it("attaches the API-Key header when an apiKey is set", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, envelope({ orders: [] })));
    const api = new PaycrestApi({
      apiKey: "test-key",
      fetch: fetchMock as unknown as typeof fetch,
    });
    await api.listOrders();
    const [, init] = fetchMock.mock.calls[0]!;
    const headers = init.headers as Record<string, string>;
    expect(headers["API-Key"]).toBe("test-key");
  });

  it("rejects order-creating calls when apiKey is missing", async () => {
    const fetchMock = vi.fn();
    const api = new PaycrestApi({
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(api.createOrder({})).rejects.toThrow(/API key/i);
  });

  it("rejects empty order ids before hitting the network (deterministic argument error)", async () => {
    const fetchMock = vi.fn();
    const api = new PaycrestApi({
      apiKey: "k",
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(api.getOrder("")).rejects.toThrow(/id is required/i);
    await expect(api.getOrder("   ")).rejects.toThrow(/id is required/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects empty/whitespace gateway ids in getProviderOrderStatus", async () => {
    const fetchMock = vi.fn();
    const api = new PaycrestApi({
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(api.getProviderOrderStatus(1n, "")).rejects.toThrow(
      /gatewayId is required/i
    );
    await expect(api.getProviderOrderStatus(1n, "   ")).rejects.toThrow(
      /gatewayId is required/i
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects unsafe-integer chainId in getProviderOrderStatus (would silently round)", async () => {
    const fetchMock = vi.fn();
    const api = new PaycrestApi({
      fetch: fetchMock as unknown as typeof fetch,
    });
    // Number.MAX_SAFE_INTEGER + 1 — any number above 2^53-1 silently
    // rounds when stringified, so the SDK would request the wrong
    // order id. Reject up front.
    const unsafe = Number.MAX_SAFE_INTEGER + 1;
    await expect(api.getProviderOrderStatus(unsafe, "0xabc")).rejects.toThrow(
      /safe integer/i
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects empty/whitespace string chainId in getProviderOrderStatus", async () => {
    const fetchMock = vi.fn();
    const api = new PaycrestApi({
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(api.getProviderOrderStatus("", "0xabc")).rejects.toThrow(
      /chainId is required/i
    );
    await expect(api.getProviderOrderStatus("   ", "0xabc")).rejects.toThrow(
      /chainId is required/i
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only API keys on order-creating calls", async () => {
    const fetchMock = vi.fn();
    const api = new PaycrestApi({
      apiKey: "   ",
      fetch: fetchMock as unknown as typeof fetch,
    });
    // Whitespace-only keys must be treated as missing so the failure
    // is a deterministic argument error rather than a remote 401.
    await expect(api.createOrder({})).rejects.toThrow(/API key/i);
    await expect(api.getOrder("ord-1")).rejects.toThrow(/API key/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces the server error message on 4xx responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(400, { status: "error", message: "validation failed" })
      );
    const api = new PaycrestApi({
      apiKey: "k",
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(api.getOrder("x")).rejects.toThrow(/validation failed/);
  });
});

describe("Paycrest gateway off-ramp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits approve + create_order calls and forwards the rate", async () => {
    const { publicKey, privateKey } = buildKeyPair();
    const fetchMock = vi.fn().mockImplementation(async (url: string | URL) => {
      const u = url.toString();
      if (u.endsWith("/v2/pubkey")) {
        return jsonResponse(200, envelope(publicKey));
      }
      if (u.includes("/v2/rates/")) {
        return jsonResponse(
          200,
          envelope({
            sell: {
              rate: "1500.50",
              providerIds: [],
              orderType: "regular",
              refundTimeoutMinutes: 60,
            },
          })
        );
      }
      throw new Error(`unexpected fetch: ${u}`);
    });

    const paycrest = new Paycrest({
      apiKey: "test-key",
      fetch: fetchMock as unknown as typeof fetch,
    });

    const { wallet, executeMock, receiptMock, waitMock } = makeFakeWallet();
    const orderIdHex =
      "0x07f3b1c0000000000000000000000000000000000000000000000000000000ab";
    const { ORDER_CREATED_EVENT_SELECTOR } = await import("@/paycrest/gateway");
    receiptMock.mockResolvedValueOnce({
      events: [
        {
          from_address: PAYCREST_GATEWAY_MAINNET,
          keys: [
            ORDER_CREATED_EVENT_SELECTOR,
            SENDER,
            USDC.address,
            "0x" + (100n * 10n ** 6n).toString(16),
            "0x0",
          ],
          data: ["0x0", "0x0", orderIdHex, "0x" + 150050n.toString(16)],
        },
      ],
    });

    const result = await paycrest.offramp(wallet, {
      from: { token: USDC, amount: Amount.parse("100", USDC) },
      to: {
        currency: "NGN",
        recipient: {
          institution: "GTBINGLA",
          accountIdentifier: "1234567890",
          accountName: "Test",
        },
      },
    });

    expect(result.path).toBe("gateway");
    expect(result.rate).toBe("1500.50");
    expect(result.calls).toHaveLength(2);
    expect(result.calls[0]!.entrypoint).toBe("approve");
    expect(result.calls[1]!.entrypoint).toBe("create_order");
    expect(result.calls[1]!.contractAddress).toBe(PAYCREST_GATEWAY_MAINNET);
    expect(result.calls[1]!.calldata).toBeTruthy();
    expect(executeMock).toHaveBeenCalledTimes(1);

    // orderId is a lazy Promise — internally awaits tx.wait() and parses
    // the OrderCreated event. Resolves only after we await it.
    const id = await result.orderId;
    expect(waitMock).toHaveBeenCalled();
    // num.toHex strips leading zeros from felt252 hex.
    expect(id).toBe(
      "0x7f3b1c0000000000000000000000000000000000000000000000000000000ab"
    );
    void privateKey;
  });

  it("resolves orderId to null when the tx reverts", async () => {
    const { publicKey } = buildKeyPair();
    const fetchMock = vi.fn().mockImplementation(async (url: string | URL) => {
      const u = url.toString();
      if (u.endsWith("/v2/pubkey"))
        return jsonResponse(200, envelope(publicKey));
      if (u.includes("/v2/rates/"))
        return jsonResponse(
          200,
          envelope({
            sell: {
              rate: "1500",
              providerIds: [],
              orderType: "regular",
              refundTimeoutMinutes: 60,
            },
          })
        );
      throw new Error(`unexpected: ${u}`);
    });
    const paycrest = new Paycrest({
      apiKey: "k",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const { wallet, waitMock } = makeFakeWallet();
    waitMock.mockRejectedValueOnce(new Error("reverted"));
    const result = await paycrest.offramp(wallet, {
      from: { token: USDC, amount: Amount.parse("100", USDC) },
      to: {
        currency: "NGN",
        recipient: {
          institution: "GTBINGLA",
          accountIdentifier: "1",
          accountName: "x",
        },
      },
    });
    expect(await result.orderId).toBeNull();
  });

  it("throws when offramp is called with a sepolia wallet", async () => {
    const paycrest = new Paycrest({
      apiKey: "k",
      fetch: vi.fn() as unknown as typeof fetch,
    });
    const { wallet } = makeFakeWallet();
    (wallet as unknown as { getChainId: () => ChainId }).getChainId = () =>
      ChainId.SEPOLIA;

    await expect(
      paycrest.offramp(wallet, {
        from: { token: USDC, amount: Amount.parse("100", USDC) },
        to: {
          currency: "NGN",
          recipient: {
            institution: "GTBINGLA",
            accountIdentifier: "1",
            accountName: "x",
          },
        },
      })
    ).rejects.toThrow(/mainnet-only/i);
  });

  it("rejects senderFeeOverride on the gateway path (api-path concept)", async () => {
    const paycrest = new Paycrest({
      apiKey: "k",
      fetch: vi.fn() as unknown as typeof fetch,
    });
    const { wallet } = makeFakeWallet();
    await expect(
      paycrest.offramp(wallet, {
        from: { token: USDC, amount: Amount.parse("100", USDC) },
        to: {
          currency: "NGN",
          recipient: {
            institution: "GTBINGLA",
            accountIdentifier: "1",
            accountName: "x",
          },
        },
        senderFeeOverride: { percent: 0.5 },
      })
    ).rejects.toThrow(/only applies to the api path/i);
  });
});

describe("Paycrest API off-ramp", () => {
  it("posts an offramp body and emits a transfer Call to receiveAddress", async () => {
    const receiveAddress =
      "0x05bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        201,
        envelope({
          id: "ord-001",
          status: "initiated",
          providerAccount: { receiveAddress, network: "starknet" },
        })
      )
    );

    const paycrest = new Paycrest({
      apiKey: "test-key",
      fetch: fetchMock as unknown as typeof fetch,
    });

    const { wallet, executeMock } = makeFakeWallet();
    const result = await paycrest.offramp(wallet, {
      path: "api",
      from: { token: USDC, amount: Amount.parse("50", USDC) },
      to: {
        currency: "NGN",
        recipient: {
          institution: "GTBINGLA",
          accountIdentifier: "1234567890",
          accountName: "Test",
          memo: "Salary",
        },
      },
      reference: "order-001",
    });

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init.body as string) as {
      amount: string;
      source: { network: string; refundAddress: string };
      destination: { recipient: { memo?: string } };
      reference: string;
    };
    expect(body.amount).toBe("50");
    expect(body.source.network).toBe("starknet");
    expect(body.source.refundAddress).toBe(SENDER);
    expect(body.destination.recipient.memo).toBe("Salary");
    expect(body.reference).toBe("order-001");

    expect(result.path).toBe("api");
    expect(await result.orderId).toBe("ord-001");
    expect(result.receiveAddress).toBe(receiveAddress);
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0]!.entrypoint).toBe("transfer");
    expect(executeMock).toHaveBeenCalledTimes(1);
  });

  it("transfers amount + senderFee + transactionFee returned by the API", async () => {
    const receiveAddress =
      "0x05bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        201,
        envelope({
          id: "ord-fee",
          status: "initiated",
          amount: "50",
          // Aggregator-computed fees (token units), returned top-level
          // in the v2 create response.
          senderFee: "0.5",
          transactionFee: "0.1",
          providerAccount: { receiveAddress, network: "starknet" },
        })
      )
    );

    const paycrest = new Paycrest({
      apiKey: "test-key",
      fetch: fetchMock as unknown as typeof fetch,
    });

    const { wallet } = makeFakeWallet();
    const result = await paycrest.offramp(wallet, {
      path: "api",
      from: { token: USDC, amount: Amount.parse("50", USDC) },
      to: {
        currency: "NGN",
        recipient: {
          institution: "GTBINGLA",
          accountIdentifier: "1234567890",
          accountName: "Test",
        },
      },
    });

    // No fee fields are sent in the request body (fees are dashboard-
    // configured server-side); the order amount is the off-ramp amount.
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init.body as string) as {
      amount: string;
      senderFee?: string;
      senderFeeRecipient?: string;
    };
    expect(body.amount).toBe("50");
    expect(body.senderFee).toBeUndefined();
    expect(body.senderFeeRecipient).toBeUndefined();

    // Transfer = 50 + 0.5 + 0.1 = 50.6 USDC (50_600000 base).
    // ERC20 transfer calldata: [recipient, amount.low, amount.high].
    const calldata = result.calls[0]!.calldata as string[];
    expect(num.toBigInt(calldata[1]!)).toBe(50_600000n);
    expect(num.toBigInt(calldata[2]!)).toBe(0n);
  });

  it("rejects input.senderFee on the api path (gateway-only concept)", async () => {
    const fetchMock = vi.fn();
    const paycrest = new Paycrest({
      apiKey: "test-key",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const { wallet } = makeFakeWallet();
    await expect(
      paycrest.offramp(wallet, {
        path: "api",
        from: { token: USDC, amount: Amount.parse("50", USDC) },
        to: {
          currency: "NGN",
          recipient: {
            institution: "GTBINGLA",
            accountIdentifier: "1234567890",
            accountName: "Test",
          },
        },
        senderFee: {
          recipient: fromAddress("0x02fee"),
          amount: 1_000000n,
        },
      })
    ).rejects.toThrow(/only supported on the gateway path/i);
    // Fails before creating an order.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards a fixed senderFeeOverride as body.senderFee", async () => {
    const receiveAddress =
      "0x05bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        201,
        envelope({
          id: "ord-ovr",
          status: "initiated",
          providerAccount: { receiveAddress, network: "starknet" },
        })
      )
    );
    const paycrest = new Paycrest({
      apiKey: "k",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const { wallet } = makeFakeWallet();
    await paycrest.offramp(wallet, {
      path: "api",
      from: { token: USDC, amount: Amount.parse("50", USDC) },
      to: {
        currency: "NGN",
        recipient: {
          institution: "GTBINGLA",
          accountIdentifier: "1234567890",
          accountName: "Test",
        },
      },
      senderFeeOverride: { amount: Amount.parse("0.75", USDC) },
    });
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init.body as string) as {
      senderFee?: string;
      senderFeePercent?: string;
    };
    expect(body.senderFee).toBe("0.75");
    expect(body.senderFeePercent).toBeUndefined();
  });

  it("forwards a percent senderFeeOverride as body.senderFeePercent", async () => {
    const receiveAddress =
      "0x05bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        201,
        envelope({
          id: "ord-ovr-pct",
          status: "initiated",
          providerAccount: { receiveAddress, network: "starknet" },
        })
      )
    );
    const paycrest = new Paycrest({
      apiKey: "k",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const { wallet } = makeFakeWallet();
    await paycrest.offramp(wallet, {
      path: "api",
      from: { token: USDC, amount: Amount.parse("50", USDC) },
      to: {
        currency: "NGN",
        recipient: {
          institution: "GTBINGLA",
          accountIdentifier: "1234567890",
          accountName: "Test",
        },
      },
      senderFeeOverride: { percent: 0.5 },
    });
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init.body as string) as {
      senderFee?: string;
      senderFeePercent?: string;
    };
    expect(body.senderFeePercent).toBe("0.5");
    expect(body.senderFee).toBeUndefined();
  });
});

describe("Paycrest on-ramp", () => {
  it("posts an onramp body and returns providerAccount", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        201,
        envelope({
          id: "ord-002",
          status: "initiated",
          providerAccount: {
            institution: "GTB",
            accountIdentifier: "0123456789",
            accountName: "Provider A",
            amountToTransfer: "50000",
            currency: "NGN",
            validUntil: "2026-03-01T10:05:00Z",
          },
        })
      )
    );
    const paycrest = new Paycrest({
      apiKey: "k",
      fetch: fetchMock as unknown as typeof fetch,
    });

    const result = await paycrest.onramp({
      from: {
        currency: "NGN",
        amount: 50000,
        refundAccount: {
          institution: "GTBINGLA",
          accountIdentifier: "1234567890",
          accountName: "John Doe",
        },
      },
      to: { token: USDC, recipient: SENDER },
      reference: "order-002",
    });

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init.body as string) as {
      amountIn: string;
      source: { type: string; refundAccount: { institution: string } };
      destination: { recipient: { network: string } };
    };
    expect(body.amountIn).toBe("fiat");
    expect(body.source.type).toBe("fiat");
    expect(body.source.refundAccount.institution).toBe("GTBINGLA");
    expect(body.destination.recipient.network).toBe("starknet");

    expect(result.orderId).toBe("ord-002");
    expect(result.providerAccount.amountToTransfer).toBe("50000");
    expect(result.providerAccount.currency).toBe("NGN");
    expect(result.reference).toBe("order-002");
  });

  it("falls back to providerAccount.validUntil when the top-level field is missing", async () => {
    // The Sender API surfaces validUntil either at the top level or
    // nested under providerAccount; the SDK must accept both.
    const validUntil = "2026-05-09T10:05:00Z";
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        201,
        envelope({
          id: "ord-vu",
          status: "initiated",
          // validUntil is ONLY on providerAccount
          providerAccount: {
            institution: "GTB",
            accountIdentifier: "0123456789",
            accountName: "Provider A",
            amountToTransfer: "50000",
            currency: "NGN",
            validUntil,
          },
        })
      )
    );
    const paycrest = new Paycrest({
      apiKey: "k",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const result = await paycrest.onramp({
      from: {
        currency: "NGN",
        amount: 50000,
        refundAccount: {
          institution: "GTB",
          accountIdentifier: "1",
          accountName: "x",
        },
      },
      to: { token: USDC, recipient: SENDER },
    });
    expect(result.validUntil).toBe(validUntil);
  });

  it("forwards a senderFeeOverride into the onramp body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        201,
        envelope({
          id: "ord-on-ovr",
          status: "initiated",
          providerAccount: {
            institution: "GTB",
            accountIdentifier: "0123456789",
            accountName: "Provider A",
            amountToTransfer: "50000",
            currency: "NGN",
          },
        })
      )
    );
    const paycrest = new Paycrest({
      apiKey: "k",
      fetch: fetchMock as unknown as typeof fetch,
    });
    await paycrest.onramp({
      from: {
        currency: "NGN",
        amount: 50000,
        refundAccount: {
          institution: "GTB",
          accountIdentifier: "1",
          accountName: "x",
        },
      },
      to: { token: USDC, recipient: SENDER },
      senderFeeOverride: { percent: "0.25" },
    });
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init.body as string) as {
      senderFeePercent?: string;
    };
    expect(body.senderFeePercent).toBe("0.25");
  });

  it("accepts 40-hex-digit Starknet recipients (valid felt252 that fits in 160 bits)", async () => {
    // Regression: previously the SDK guarded against /^0x[0-9a-f]{40}$/
    // recipients on the assumption they were EVM addresses, but a
    // Starknet felt252 can legitimately have a small numeric value
    // that prints with only 40 hex digits.
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        201,
        envelope({
          id: "ord-x",
          status: "initiated",
          providerAccount: {
            institution: "GTB",
            accountIdentifier: "0",
            accountName: "Provider",
            amountToTransfer: "1000",
            currency: "NGN",
          },
        })
      )
    );
    const paycrest = new Paycrest({
      apiKey: "k",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const result = await paycrest.onramp({
      from: {
        currency: "NGN",
        amount: 1000,
        refundAccount: {
          institution: "GTB",
          accountIdentifier: "1",
          accountName: "x",
        },
      },
      to: {
        token: USDC,
        recipient: "0x01abcdef000000000000000000000000000000ab" as Address,
      },
    });
    expect(result.orderId).toBe("ord-x");
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init.body as string) as {
      destination: { recipient: { address: string; network: string } };
    };
    expect(body.destination.recipient.address).toBe(
      "0x01abcdef000000000000000000000000000000ab"
    );
    expect(body.destination.recipient.network).toBe("starknet");
  });
});

describe("Paycrest.waitForOrder", () => {
  function buildPaycrestWithOrderResponses(
    responses: Array<{ status: string }>
  ): {
    paycrest: Paycrest;
    fetchMock: ReturnType<typeof vi.fn>;
  } {
    let i = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      const next = responses[Math.min(i, responses.length - 1)]!;
      i++;
      return jsonResponse(200, envelope({ id: "ord-1", ...next }));
    });
    const paycrest = new Paycrest({
      apiKey: "k",
      fetch: fetchMock as unknown as typeof fetch,
    });
    return { paycrest, fetchMock };
  }

  it("polls until status reaches a success terminal (validated)", async () => {
    const { paycrest, fetchMock } = buildPaycrestWithOrderResponses([
      { status: "initiated" },
      { status: "deposited" },
      { status: "validated" },
    ]);
    const order = await paycrest.waitForOrder("ord-1", { pollIntervalMs: 1 });
    expect(order.status).toBe("validated");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("resolves immediately when the first poll already shows settled", async () => {
    const { paycrest, fetchMock } = buildPaycrestWithOrderResponses([
      { status: "settled" },
    ]);
    const order = await paycrest.waitForOrder("ord-1", { pollIntervalMs: 1 });
    expect(order.status).toBe("settled");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("succeeds on settled even when validated is skipped between polls", async () => {
    // Poll cadence can be longer than the gap between validated and
    // settled, so we may never observe validated. Both are success
    // terminals — landing directly on settled must resolve.
    const { paycrest } = buildPaycrestWithOrderResponses([
      { status: "initiated" },
      { status: "deposited" },
      { status: "settled" },
    ]);
    const order = await paycrest.waitForOrder("ord-1", { pollIntervalMs: 1 });
    expect(order.status).toBe("settled");
  });

  it("throws PaycrestOrderError when the order is refunded", async () => {
    const { paycrest } = buildPaycrestWithOrderResponses([
      { status: "refunding" },
      { status: "refunded" },
    ]);
    await expect(
      paycrest.waitForOrder("ord-1", { pollIntervalMs: 1 })
    ).rejects.toBeInstanceOf(PaycrestOrderError);
  });

  it("throws PaycrestOrderError when the order expires", async () => {
    const { paycrest } = buildPaycrestWithOrderResponses([
      { status: "expired" },
    ]);
    let caught: unknown;
    try {
      await paycrest.waitForOrder("ord-1", { pollIntervalMs: 1 });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(PaycrestOrderError);
    expect((caught as PaycrestOrderError).order.status).toBe("expired");
  });

  it("times out when no terminal state is reached", async () => {
    const { paycrest } = buildPaycrestWithOrderResponses([
      { status: "pending" },
    ]);
    await expect(
      paycrest.waitForOrder("ord-1", {
        pollIntervalMs: 5,
        timeoutMs: 20,
      })
    ).rejects.toThrow(/timed out/i);
  });

  it("aborts when signal fires", async () => {
    const { paycrest } = buildPaycrestWithOrderResponses([
      { status: "pending" },
    ]);
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 10);
    await expect(
      paycrest.waitForOrder("ord-1", {
        pollIntervalMs: 100,
        timeoutMs: 60_000,
        signal: ac.signal,
      })
    ).rejects.toThrow(/aborted by signal/i);
  });

  it("respects custom successStates / errorStates", async () => {
    // Treat "deposited" as success and disable default error states.
    const { paycrest } = buildPaycrestWithOrderResponses([
      { status: "deposited" },
    ]);
    const order = await paycrest.waitForOrder("ord-1", {
      pollIntervalMs: 1,
      successStates: ["deposited"],
      errorStates: [],
    });
    expect(order.status).toBe("deposited");
  });

  it("fails immediately on 404 (api-path 404 means bad id, not indexer lag)", async () => {
    // Only `waitForGatewayOrder` should treat 404 as transient — for
    // `waitForOrder` (api-path UUID), a 404 is a definitive bad-id
    // response and must fail fast rather than wait out the timeout.
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(404, { message: "Order not found" }));
    const paycrest = new Paycrest({
      apiKey: "k",
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(
      paycrest.waitForOrder("ord-missing", { pollIntervalMs: 1 })
    ).rejects.toBeInstanceOf(PaycrestApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("Paycrest.waitForGatewayOrder", () => {
  it("hits /v2/orders/{chain_id}/{gateway_id} with STARKNET_MAINNET_CHAIN_ID by default", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, envelope({ orderId: "0xabc", status: "settled" }))
      );
    const paycrest = new Paycrest({
      apiKey: "k",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const result = await paycrest.waitForGatewayOrder("0xabc", {
      pollIntervalMs: 1,
    });
    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain(
      `/v2/orders/${STARKNET_MAINNET_CHAIN_ID.toString()}/0xabc`
    );
    expect(result.status).toBe("settled");
  });

  it("accepts a chainId override", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, envelope({ orderId: "0xabc", status: "validated" }))
      );
    const paycrest = new Paycrest({
      apiKey: "k",
      fetch: fetchMock as unknown as typeof fetch,
    });
    await paycrest.waitForGatewayOrder("0xabc", {
      pollIntervalMs: 1,
      chainId: 99999n,
    });
    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/v2/orders/99999/0xabc");
  });

  it("throws PaycrestOrderError when the order is refunded", async () => {
    let i = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      const status = i++ === 0 ? "refunding" : "refunded";
      return jsonResponse(200, envelope({ orderId: "0xabc", status }));
    });
    const paycrest = new Paycrest({
      apiKey: "k",
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(
      paycrest.waitForGatewayOrder("0xabc", { pollIntervalMs: 1 })
    ).rejects.toBeInstanceOf(PaycrestOrderError);
  });

  it("retries on 404 while the indexer catches up, then succeeds", async () => {
    let i = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      if (i++ < 2) {
        return jsonResponse(404, { message: "Order not found" });
      }
      return jsonResponse(
        200,
        envelope({ orderId: "0xabc", status: "settled" })
      );
    });
    const paycrest = new Paycrest({
      apiKey: "k",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const result = await paycrest.waitForGatewayOrder("0xabc", {
      pollIntervalMs: 1,
    });
    expect(result.status).toBe("settled");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("times out with a clear message when the indexer never catches up", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(404, { message: "Order not found" }));
    const paycrest = new Paycrest({
      apiKey: "k",
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(
      paycrest.waitForGatewayOrder("0xabc", {
        pollIntervalMs: 5,
        timeoutMs: 20,
      })
    ).rejects.toThrow(/never indexed/i);
  });

  it("propagates non-404 API errors immediately", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(500, { message: "Internal Server Error" })
      );
    const paycrest = new Paycrest({
      apiKey: "k",
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(
      paycrest.waitForGatewayOrder("0xabc", { pollIntervalMs: 1 })
    ).rejects.toBeInstanceOf(PaycrestApiError);
    // Should give up after the first non-404 response.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("OfframpResult.wait() dispatch", () => {
  it("api-path result.wait() polls /v2/sender/orders/{uuid}", async () => {
    const receiveAddress =
      "0x05bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    let calls = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string | URL) => {
      const u = String(url);
      if (u.endsWith("/v2/sender/orders") && calls++ === 0) {
        // POST createOrder response
        return jsonResponse(
          201,
          envelope({
            id: "uuid-1",
            status: "initiated",
            providerAccount: { receiveAddress, network: "starknet" },
          })
        );
      }
      if (u.includes("/v2/sender/orders/uuid-1")) {
        return jsonResponse(200, envelope({ id: "uuid-1", status: "settled" }));
      }
      throw new Error(`unexpected: ${u}`);
    });
    const paycrest = new Paycrest({
      apiKey: "k",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const { wallet } = makeFakeWallet();
    const result = await paycrest.offramp(wallet, {
      path: "api",
      from: { token: USDC, amount: Amount.parse("1", USDC) },
      to: {
        currency: "NGN",
        recipient: {
          institution: "GTBINGLA",
          accountIdentifier: "1",
          accountName: "x",
        },
      },
    });
    const status = await result.wait({ pollIntervalMs: 1 });
    expect(status.path).toBe("api");
    expect(status.orderId).toBe("uuid-1");
    expect(status.status).toBe("settled");
    // Confirms the lookup hit the sender-orders path, not the
    // gateway-id path.
    const lookupCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/v2/sender/orders/uuid-1")
    );
    expect(lookupCalls.length).toBeGreaterThan(0);
  });

  it("gateway-path result.wait() polls /v2/orders/{chain_id}/{gateway_id}", async () => {
    const { publicKey } = buildKeyPair();
    const orderIdHex =
      "0x07f3b1c0000000000000000000000000000000000000000000000000000000ab";
    const { ORDER_CREATED_EVENT_SELECTOR } = await import("@/paycrest/gateway");

    const fetchMock = vi.fn().mockImplementation(async (url: string | URL) => {
      const u = String(url);
      if (u.endsWith("/v2/pubkey"))
        return jsonResponse(200, envelope(publicKey));
      if (u.includes("/v2/rates/"))
        return jsonResponse(
          200,
          envelope({
            sell: {
              rate: "1500",
              providerIds: [],
              orderType: "regular",
              refundTimeoutMinutes: 60,
            },
          })
        );
      if (u.includes(`/v2/orders/${STARKNET_MAINNET_CHAIN_ID.toString()}/`)) {
        return jsonResponse(
          200,
          envelope({ orderId: orderIdHex, status: "validated" })
        );
      }
      throw new Error(`unexpected: ${u}`);
    });

    const paycrest = new Paycrest({
      apiKey: "k",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const { wallet, receiptMock } = makeFakeWallet();
    receiptMock.mockResolvedValueOnce({
      events: [
        {
          from_address: PAYCREST_GATEWAY_MAINNET,
          keys: [
            ORDER_CREATED_EVENT_SELECTOR,
            SENDER,
            USDC.address,
            "0x" + (1n * 10n ** 6n).toString(16),
            "0x0",
          ],
          data: ["0x0", "0x0", orderIdHex, "0x" + 150000n.toString(16)],
        },
      ],
    });

    const result = await paycrest.offramp(wallet, {
      from: { token: USDC, amount: Amount.parse("1", USDC) },
      to: {
        currency: "NGN",
        recipient: {
          institution: "GTBINGLA",
          accountIdentifier: "1",
          accountName: "x",
        },
      },
    });
    const status = await result.wait({ pollIntervalMs: 1 });
    expect(status.path).toBe("gateway");
    expect(status.status).toBe("validated");
    // Confirms the lookup hit the gateway-id endpoint, not /v2/sender/orders.
    const lookupCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes(
        `/v2/orders/${STARKNET_MAINNET_CHAIN_ID.toString()}/`
      )
    );
    expect(lookupCalls.length).toBeGreaterThan(0);
    const senderCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/v2/sender/orders/")
    );
    expect(senderCalls.length).toBe(0);
  });

  it("memoizes wait(): a second concurrent call reuses the first poll", async () => {
    const receiveAddress =
      "0x05bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    let posted = false;
    const fetchMock = vi.fn().mockImplementation(async (url: string | URL) => {
      const u = String(url);
      if (u.endsWith("/v2/sender/orders") && !posted) {
        posted = true;
        return jsonResponse(
          201,
          envelope({
            id: "uuid-memo",
            status: "initiated",
            providerAccount: { receiveAddress, network: "starknet" },
          })
        );
      }
      if (u.includes("/v2/sender/orders/uuid-memo")) {
        return jsonResponse(
          200,
          envelope({ id: "uuid-memo", status: "settled" })
        );
      }
      throw new Error(`unexpected: ${u}`);
    });
    const paycrest = new Paycrest({
      apiKey: "k",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const { wallet } = makeFakeWallet();
    const result = await paycrest.offramp(wallet, {
      path: "api",
      from: { token: USDC, amount: Amount.parse("1", USDC) },
      to: {
        currency: "NGN",
        recipient: {
          institution: "GTBINGLA",
          accountIdentifier: "1",
          accountName: "x",
        },
      },
    });
    // Two calls in flight at once must share a single polling loop.
    const [a, b] = await Promise.all([
      result.wait({ pollIntervalMs: 1 }),
      result.wait({ pollIntervalMs: 1 }),
    ]);
    expect(a).toBe(b);
    const lookupCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/v2/sender/orders/uuid-memo")
    );
    expect(lookupCalls.length).toBe(1);
  });

  it("throws when gateway off-ramp tx reverted (no on-chain order id)", async () => {
    const { publicKey } = buildKeyPair();
    const fetchMock = vi.fn().mockImplementation(async (url: string | URL) => {
      const u = String(url);
      if (u.endsWith("/v2/pubkey"))
        return jsonResponse(200, envelope(publicKey));
      if (u.includes("/v2/rates/"))
        return jsonResponse(
          200,
          envelope({
            sell: {
              rate: "1500",
              providerIds: [],
              orderType: "regular",
              refundTimeoutMinutes: 60,
            },
          })
        );
      throw new Error(`unexpected: ${u}`);
    });
    const paycrest = new Paycrest({
      apiKey: "k",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const { wallet, waitMock } = makeFakeWallet();
    waitMock.mockRejectedValueOnce(new Error("reverted"));
    const result = await paycrest.offramp(wallet, {
      from: { token: USDC, amount: Amount.parse("1", USDC) },
      to: {
        currency: "NGN",
        recipient: {
          institution: "GTBINGLA",
          accountIdentifier: "1",
          accountName: "x",
        },
      },
    });
    await expect(result.wait({ pollIntervalMs: 1 })).rejects.toThrow(
      /no on-chain order id/i
    );
  });
});

describe("Paycrest gateway off-ramp — caller-supplied rate", () => {
  it("uses input.rate without hitting /v2/rates when supplied", async () => {
    const { publicKey } = buildKeyPair();
    const fetchMock = vi.fn().mockImplementation(async (url: string | URL) => {
      const u = String(url);
      if (u.endsWith("/v2/pubkey"))
        return jsonResponse(200, envelope(publicKey));
      if (u.includes("/v2/rates/")) {
        throw new Error(
          "rate fetch should be skipped when input.rate is provided"
        );
      }
      throw new Error(`unexpected: ${u}`);
    });
    const paycrest = new Paycrest({
      apiKey: "k",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const { wallet } = makeFakeWallet();

    const result = await paycrest.offramp(wallet, {
      from: { token: USDC, amount: Amount.parse("100", USDC) },
      to: {
        currency: "NGN",
        recipient: {
          institution: "GTBINGLA",
          accountIdentifier: "1234567890",
          accountName: "Test",
        },
      },
      rate: "1361.92",
    });

    expect(result.path).toBe("gateway");
    expect(result.rate).toBe("1361.92");
    // Confirm /v2/rates was never hit
    const rateCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/v2/rates/")
    );
    expect(rateCalls.length).toBe(0);
    // Decode the create_order rate calldata: rate is the third
    // argument (token, amount.low, amount.high, rate, ...) — check
    // it scaled to 136192.
    const createOrderCall = result.calls[1]!;
    expect(createOrderCall.calldata).toBeTruthy();
    // calldata format: [token, amount.low, amount.high, rate, ...]
    // We assert the rate slot equals 136192 (decimal) as a hex string.
    const calldataArr = createOrderCall.calldata as string[];
    expect(BigInt(calldataArr[3]!)).toBe(136192n);
  });
});

describe("Paycrest API off-ramp — execute-failure handling", () => {
  it("throws PaycrestOfframpExecuteError carrying order details when wallet.execute fails", async () => {
    const receiveAddress =
      "0x05bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        201,
        envelope({
          id: "ord-fail",
          status: "initiated",
          providerAccount: { receiveAddress, network: "starknet" },
        })
      )
    );
    const paycrest = new Paycrest({
      apiKey: "k",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const { wallet, executeMock } = makeFakeWallet();
    const cause = new Error("rpc dropped");
    executeMock.mockRejectedValueOnce(cause);

    let caught: unknown;
    try {
      await paycrest.offramp(wallet, {
        path: "api",
        from: { token: USDC, amount: Amount.parse("50", USDC) },
        to: {
          currency: "NGN",
          recipient: {
            institution: "GTBINGLA",
            accountIdentifier: "1",
            accountName: "x",
          },
        },
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(PaycrestOfframpExecuteError);
    const err = caught as PaycrestOfframpExecuteError;
    expect(err.orderId).toBe("ord-fail");
    expect(err.receiveAddress).toBe(receiveAddress);
    expect(err.order.status).toBe("initiated");
    expect(err.cause).toBe(cause);
  });
});

describe("Paycrest abort signal", () => {
  it("forwards the caller's signal to the in-flight HTTP request", async () => {
    // Track whether the fetcher saw an aborted signal
    let observedAborted = false;
    const fetchMock = vi.fn().mockImplementation(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            observedAborted = true;
            reject(new DOMException("aborted", "AbortError"));
          });
        })
    );
    const paycrest = new Paycrest({
      apiKey: "k",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const ac = new AbortController();
    // Abort almost immediately so the fetch promise rejects via the
    // signal rather than the request's internal timeout.
    setTimeout(() => ac.abort(), 5);
    await expect(
      paycrest.waitForOrder("ord-1", {
        pollIntervalMs: 60_000,
        timeoutMs: 60_000,
        signal: ac.signal,
      })
    ).rejects.toThrow(/aborted/i);
    expect(observedAborted).toBe(true);
  });
});

describe("Paycrest paymaster forwarding (sponsored execution)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function buildGatewayPaycrest(): Promise<{
    paycrest: Paycrest;
    fetchMock: ReturnType<typeof vi.fn>;
  }> {
    const { publicKey } = buildKeyPair();
    const fetchMock = vi.fn().mockImplementation(async (url: string | URL) => {
      const u = String(url);
      if (u.endsWith("/v2/pubkey"))
        return jsonResponse(200, envelope(publicKey));
      if (u.includes("/v2/rates/"))
        return jsonResponse(
          200,
          envelope({
            sell: {
              rate: "1500",
              providerIds: [],
              orderType: "regular",
              refundTimeoutMinutes: 60,
            },
          })
        );
      throw new Error(`unexpected fetch: ${u}`);
    });
    const paycrest = new Paycrest({
      apiKey: "k",
      fetch: fetchMock as unknown as typeof fetch,
    });
    return { paycrest, fetchMock };
  }

  it("gateway-path offramp() forwards feeMode and submits ONE batched multicall", async () => {
    const { paycrest } = await buildGatewayPaycrest();
    const { wallet, executeMock } = makeFakeWallet();

    await paycrest.offramp(
      wallet,
      {
        from: { token: USDC, amount: Amount.parse("1", USDC) },
        to: {
          currency: "NGN",
          recipient: {
            institution: "GTBINGLA",
            accountIdentifier: "1",
            accountName: "x",
          },
        },
      },
      { feeMode: { type: "paymaster" } }
    );

    expect(executeMock).toHaveBeenCalledTimes(1);
    const [calls, options] = executeMock.mock.calls[0]!;
    // Approve + create_order in a single multicall — proves the
    // sponsored unit is the whole batch, not two separate txs.
    expect(calls).toHaveLength(2);
    expect((calls as { entrypoint: string }[])[0]!.entrypoint).toBe("approve");
    expect((calls as { entrypoint: string }[])[1]!.entrypoint).toBe(
      "create_order"
    );
    expect(options).toEqual({ feeMode: { type: "paymaster" } });
  });

  it("gateway-path offramp() forwards feeMode with a custom gasToken", async () => {
    const { paycrest } = await buildGatewayPaycrest();
    const { wallet, executeMock } = makeFakeWallet();

    await paycrest.offramp(
      wallet,
      {
        from: { token: USDC, amount: Amount.parse("1", USDC) },
        to: {
          currency: "NGN",
          recipient: {
            institution: "GTBINGLA",
            accountIdentifier: "1",
            accountName: "x",
          },
        },
      },
      {
        feeMode: {
          type: "paymaster",
          gasToken: USDC.address,
        },
      }
    );

    const [, options] = executeMock.mock.calls[0]!;
    expect(options.feeMode).toEqual({
      type: "paymaster",
      gasToken: USDC.address,
    });
  });

  it("api-path offramp() forwards feeMode to wallet.execute on the transfer", async () => {
    const receiveAddress =
      "0x05bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        201,
        envelope({
          id: "ord-api",
          status: "initiated",
          providerAccount: { receiveAddress, network: "starknet" },
        })
      )
    );
    const paycrest = new Paycrest({
      apiKey: "k",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const { wallet, executeMock } = makeFakeWallet();

    await paycrest.offramp(
      wallet,
      {
        path: "api",
        from: { token: USDC, amount: Amount.parse("1", USDC) },
        to: {
          currency: "NGN",
          recipient: {
            institution: "GTBINGLA",
            accountIdentifier: "1",
            accountName: "x",
          },
        },
      },
      { feeMode: { type: "paymaster" } }
    );

    const [calls, options] = executeMock.mock.calls[0]!;
    expect(calls).toHaveLength(1);
    expect((calls as { entrypoint: string }[])[0]!.entrypoint).toBe("transfer");
    expect(options).toEqual({ feeMode: { type: "paymaster" } });
  });

  it("paycrestGatewaySessionPolicies returns the (target, method) pairs Cartridge needs", () => {
    const policies = paycrestGatewaySessionPolicies({
      chainId: ChainId.MAINNET,
      token: mainnetTokens.USDC,
    });
    expect(policies).toEqual([
      { target: mainnetTokens.USDC.address, method: "approve" },
      { target: PAYCREST_GATEWAY_MAINNET, method: "create_order" },
    ]);
  });

  it("paycrestGatewaySessionPolicies throws on sepolia (Paycrest is mainnet-only)", () => {
    expect(() =>
      paycrestGatewaySessionPolicies({
        chainId: ChainId.SEPOLIA,
        token: mainnetTokens.USDC,
      })
    ).toThrow(/mainnet-only/i);
  });

  it("paycrestGatewaySessionPolicies rejects tokens Paycrest doesn't support", () => {
    // Pre-empting an authorisation that would be useless on-chain — the
    // Gateway rejects any token outside `paycrestTokensFor(chainId)`.
    expect(() =>
      paycrestGatewaySessionPolicies({
        chainId: ChainId.MAINNET,
        token: mainnetTokens.STRK,
      })
    ).toThrow(/not supported by Paycrest/i);
  });
});

describe("Paycrest webhook signature", () => {
  it("verifies a valid HMAC-SHA256 signature", async () => {
    const secret = "shh";
    const body = JSON.stringify({ event: "payment_order.settled" });
    const sig = nodeCrypto
      .createHmac("sha256", secret)
      .update(body, "utf8")
      .digest("hex");
    expect(await Paycrest.verifyWebhookSignature(body, sig, secret)).toBe(true);
  });

  it("rejects a tampered signature", async () => {
    const secret = "shh";
    const body = JSON.stringify({ event: "payment_order.settled" });
    const sig = nodeCrypto
      .createHmac("sha256", secret)
      .update(body, "utf8")
      .digest("hex");
    const tampered = sig.replace(/^./, sig[0] === "a" ? "b" : "a");
    expect(await Paycrest.verifyWebhookSignature(body, tampered, secret)).toBe(
      false
    );
  });

  it("returns false on an empty signature (request-level rejection)", async () => {
    expect(await Paycrest.verifyWebhookSignature("body", "", "k")).toBe(false);
  });

  it("throws on a missing/empty secret (configuration error, not a rejection)", async () => {
    await expect(
      Paycrest.verifyWebhookSignature("body", "sig", "")
    ).rejects.toThrow(/requires apiSecret/i);
    await expect(
      Paycrest.verifyWebhookSignature("body", "sig", "   ")
    ).rejects.toThrow(/requires apiSecret/i);
  });

  it("accepts an uppercased signature header (case-insensitive compare)", async () => {
    const secret = "shh";
    const body = JSON.stringify({ event: "payment_order.settled" });
    const sig = nodeCrypto
      .createHmac("sha256", secret)
      .update(body, "utf8")
      .digest("hex");
    expect(
      await Paycrest.verifyWebhookSignature(body, sig.toUpperCase(), secret)
    ).toBe(true);
  });
});

describe("extractOrderIdFromReceipt", () => {
  const GATEWAY = PAYCREST_GATEWAY_MAINNET;
  const SELECTOR = ORDER_CREATED_EVENT_SELECTOR;
  // data layout: [protocol_fee.low, protocol_fee.high, order_id, rate, ...message_hash]
  const ORDER_ID =
    "0x07f3b1c0000000000000000000000000000000000000000000000000000000ab";
  const NORMALIZED_ID = num.toHex(num.toBigInt(ORDER_ID));

  function event(overrides: {
    from_address?: string;
    keys?: string[];
    data?: string[];
  }): { from_address?: string; keys?: string[]; data?: string[] } {
    return {
      from_address: GATEWAY,
      keys: [SELECTOR, SENDER, USDC.address, "0x0", "0x0"],
      data: ["0x0", "0x0", ORDER_ID, "0x" + 150050n.toString(16)],
      ...overrides,
    };
  }

  it("returns the first matching OrderCreated event's order id", () => {
    const second =
      "0x01230000000000000000000000000000000000000000000000000000000000ff";
    const receipt = {
      events: [event({}), event({ data: ["0x0", "0x0", second, "0x1"] })],
    };
    expect(extractOrderIdFromReceipt(receipt, GATEWAY)).toBe(NORMALIZED_ID);
  });

  it("ignores events emitted by a different from_address", () => {
    const receipt = {
      events: [event({ from_address: USDC.address })],
    };
    expect(extractOrderIdFromReceipt(receipt, GATEWAY)).toBeNull();
  });

  it("ignores events whose keys[0] is not the OrderCreated selector", () => {
    const otherSelector = num.toHex(num.toBigInt(SELECTOR) + 1n);
    const receipt = {
      events: [event({ keys: [otherSelector, SENDER] })],
    };
    expect(extractOrderIdFromReceipt(receipt, GATEWAY)).toBeNull();
  });

  it("returns null for an empty event list", () => {
    expect(extractOrderIdFromReceipt({ events: [] }, GATEWAY)).toBeNull();
  });

  it("returns null when events is undefined", () => {
    expect(extractOrderIdFromReceipt({}, GATEWAY)).toBeNull();
  });

  it("skips (does not throw on) a malformed event with data.length < 3", () => {
    const receipt = {
      events: [event({ data: ["0x0", "0x0"] })],
    };
    expect(extractOrderIdFromReceipt(receipt, GATEWAY)).toBeNull();
  });

  it("matches despite leading-zero address differences (felt normalization)", () => {
    // The receipt's from_address is the same felt with leading zeros
    // stripped; both sides are normalized via num.toBigInt before compare.
    const stripped = num.toHex(num.toBigInt(GATEWAY));
    const receipt = {
      events: [event({ from_address: stripped })],
    };
    expect(extractOrderIdFromReceipt(receipt, GATEWAY)).toBe(NORMALIZED_ID);
  });
});
