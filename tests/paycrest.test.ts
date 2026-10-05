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
  PaycrestApi,
  PaycrestApiError,
  PaycrestOfframpExecuteError,
  PaycrestOrderError,
  paycrestNetworkFor,
  paycrestOfframpSessionPolicies,
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
} {
  const provider = {} as unknown as RpcProvider;
  const executeMock = vi.fn().mockResolvedValue({ hash: "0xtx" });
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
  return { wallet, executeMock };
}

describe("Paycrest presets", () => {
  it("maps mainnet ChainId to the starknet network identifier", () => {
    expect(paycrestNetworkFor(ChainId.MAINNET)).toBe("starknet");
  });

  it("rejects sepolia (Paycrest is mainnet-only)", () => {
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

describe("Paycrest off-ramp", () => {
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

    expect(result.orderId).toBe("ord-001");
    expect(result.receiveAddress).toBe(receiveAddress);
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0]!.entrypoint).toBe("transfer");
    expect(executeMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      "id",
      { status: "initiated", providerAccount: { receiveAddress: "0x5" } },
      /missing 'id'/,
    ],
    [
      "receiveAddress",
      { id: "ord-x", status: "initiated" },
      /no receiveAddress/,
    ],
  ])(
    "refuses to transfer when the order response has no %s",
    async (_field, order, message) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse(201, envelope(order)));
      const paycrest = new Paycrest({
        apiKey: "k",
        fetch: fetchMock as unknown as typeof fetch,
      });
      const { wallet, executeMock } = makeFakeWallet();
      await expect(
        paycrest.offramp(wallet, {
          from: { token: USDC, amount: Amount.parse("1", USDC) },
          to: {
            currency: "NGN",
            recipient: {
              institution: "GTBINGLA",
              accountIdentifier: "1",
              accountName: "x",
            },
          },
        })
      ).rejects.toThrow(message);
      // No funds move for an order we couldn't track or fund.
      expect(executeMock).not.toHaveBeenCalled();
    }
  );

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

  it.each([
    ["{ percent }", { percent: 0.5 }],
    // Legal for callers without exactOptionalPropertyTypes; `"amount" in`
    // is true here, so the mapping must check the value, not the key.
    [
      "{ percent, amount: undefined }",
      { percent: 0.5, amount: undefined } as unknown as { percent: number },
    ],
  ])(
    "forwards a percent senderFeeOverride %s as body.senderFeePercent",
    async (_label, senderFeeOverride) => {
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
        from: { token: USDC, amount: Amount.parse("50", USDC) },
        to: {
          currency: "NGN",
          recipient: {
            institution: "GTBINGLA",
            accountIdentifier: "1234567890",
            accountName: "Test",
          },
        },
        senderFeeOverride,
      });
      const [, init] = fetchMock.mock.calls[0]!;
      const body = JSON.parse(init.body as string) as {
        senderFee?: string;
        senderFeePercent?: string;
      };
      expect(body.senderFeePercent).toBe("0.5");
      expect(body.senderFee).toBeUndefined();
    }
  );
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

  it("fails immediately on 404 (bad id)", async () => {
    // A 404 for a Sender API order UUID is a definitive bad-id response
    // and must fail fast rather than wait out the timeout.
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

describe("OfframpResult.wait()", () => {
  it("result.wait() polls /v2/sender/orders/{uuid}", async () => {
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
    const order = await result.wait({ pollIntervalMs: 1 });
    expect(order.id).toBe("uuid-1");
    expect(order.status).toBe("settled");
    const lookupCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/v2/sender/orders/uuid-1")
    );
    expect(lookupCalls.length).toBeGreaterThan(0);
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

  it("wait() retries cleanly after a failure (memoizes only on success)", async () => {
    const receiveAddress =
      "0x05cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
    let posted = false;
    let lookupCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string | URL) => {
      const u = String(url);
      if (u.endsWith("/v2/sender/orders") && !posted) {
        posted = true;
        return jsonResponse(
          201,
          envelope({
            id: "uuid-retry",
            status: "initiated",
            providerAccount: { receiveAddress, network: "starknet" },
          })
        );
      }
      if (u.includes("/v2/sender/orders/uuid-retry")) {
        lookupCount += 1;
        // First wait() hits a transient network blip; the second must be
        // able to retry rather than replay the cached rejection forever.
        if (lookupCount === 1) throw new Error("transient network blip");
        return jsonResponse(
          200,
          envelope({ id: "uuid-retry", status: "settled" })
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
      /transient network blip/
    );
    const status = await result.wait({ pollIntervalMs: 1 });
    expect(status.status).toBe("settled");
    expect(lookupCount).toBe(2);
  });
});

describe("Paycrest off-ramp — execute-failure handling", () => {
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

  it("offramp() forwards feeMode to wallet.execute on the transfer", async () => {
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

  it("paycrestOfframpSessionPolicies authorises transfer on the token", () => {
    const policies = paycrestOfframpSessionPolicies({
      chainId: ChainId.MAINNET,
      token: mainnetTokens.USDC,
    });
    expect(policies).toEqual([
      { target: mainnetTokens.USDC.address, method: "transfer" },
    ]);
  });

  it("paycrestOfframpSessionPolicies throws on sepolia (Paycrest is mainnet-only)", () => {
    expect(() =>
      paycrestOfframpSessionPolicies({
        chainId: ChainId.SEPOLIA,
        token: mainnetTokens.USDC,
      })
    ).toThrow(/mainnet-only/i);
  });

  it("paycrestOfframpSessionPolicies rejects tokens Paycrest doesn't support", () => {
    expect(() =>
      paycrestOfframpSessionPolicies({
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
