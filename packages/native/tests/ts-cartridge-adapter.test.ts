import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Call } from "starknet";
import {
  clearCartridgeNativeAdapter,
  getCartridgeNativeAdapter,
} from "@/cartridge/registry";
import {
  createCartridgeTsAdapter,
  registerCartridgeTsAdapter,
} from "@/cartridge/ts";
import {
  SessionProtocolError,
  SessionRejectedError,
  SessionTimeoutError,
} from "@/cartridge/ts/errors";
import { TsSessionAccount } from "@/cartridge/ts/session_account";
import * as sessionApi from "@/cartridge/ts/session_api";

const ENCODED_SESSION =
  "eyJ1c2VybmFtZSI6InBsYXllcjEiLCJhZGRyZXNzIjoiMHhhYmMiLCJvd25lckd1aWQiOiIweDEyMyIsImV4cGlyZXNBdCI6IjQ3MDI0NDQ4MDAiLCJndWFyZGlhbktleUd1aWQiOiIweDAiLCJtZXRhZGF0YUhhc2giOiIweDAiLCJzZXNzaW9uS2V5R3VpZCI6IjB4OTk5In0=";

describe("cartridge ts adapter", () => {
  beforeEach(() => {
    clearCartridgeNativeAdapter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("connects with default TS execution path when callbacks are not provided", async () => {
    const adapter = createCartridgeTsAdapter({
      openSession: async () => ({
        status: "success",
        encodedSession: ENCODED_SESSION,
      }),
    });

    const handle = await adapter.connect({
      rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
      chainId: "0x534e5f5345504f4c4941",
      policies: [{ target: "0x1", method: "create_game" }],
    });
    expect(handle.account.address).toBe(
      "0x0000000000000000000000000000000000000000000000000000000000000abc"
    );
  });

  it("rejects invalid cartridgeUrl values before building the session URL", async () => {
    const openSession = vi.fn();
    const adapter = createCartridgeTsAdapter({
      cartridgeUrl: "ftp://x.cartridge.gg",
      openSession,
    });

    await expect(
      adapter.connect({
        rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
        chainId: "0x534e5f5345504f4c4941",
        policies: [{ target: "0x1", method: "create_game" }],
      })
    ).rejects.toThrow("cartridgeUrl must use http:// or https://");
    expect(openSession).not.toHaveBeenCalled();
  });

  it("rejects invalid cartridgeApiUrl values before invoking subscription callbacks", async () => {
    const subscribeSession = vi.fn();
    const adapter = createCartridgeTsAdapter({
      cartridgeApiUrl: "ftp://api.cartridge.gg/graphql",
      openSession: async () => ({
        status: "success",
      }),
      subscribeSession,
    });

    await expect(
      adapter.connect({
        rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
        chainId: "0x534e5f5345504f4c4941",
        policies: [{ target: "0x1", method: "create_game" }],
      })
    ).rejects.toThrow("cartridgeApiUrl must use http:// or https://");
    expect(subscribeSession).not.toHaveBeenCalled();
  });

  it("rejects invalid presetConfigBaseUrl values before resolving presets", async () => {
    const resolvePresetPolicies = vi.fn();
    const adapter = createCartridgeTsAdapter({
      presetConfigBaseUrl: "ftp://static.cartridge.gg/presets",
      resolvePresetPolicies,
    });

    await expect(
      adapter.connect({
        rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
        chainId: "0x534e5f5345504f4c4941",
        preset: "tic-tac-toe",
      })
    ).rejects.toThrow("presetConfigBaseUrl must use http:// or https://");
    expect(resolvePresetPolicies).not.toHaveBeenCalled();
  });

  it("uses pure TS V3 cartridge_addExecuteOutsideTransaction by default", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        result: { transaction_hash: "0xdeadbeef" },
      }),
    });
    const adapter = createCartridgeTsAdapter({
      openSession: async () => ({
        status: "success",
        encodedSession: ENCODED_SESSION,
      }),
      fetchImpl,
    });

    const handle = await adapter.connect({
      rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
      chainId: "0x534e5f5345504f4c4941",
      policies: [{ target: "0x1", method: "create_game" }],
    });

    const tx = await handle.account.execute(
      [
        {
          contractAddress:
            "0x0000000000000000000000000000000000000000000000000000000000000001",
          entrypoint: "create_game",
          calldata: [],
        },
      ] as Call[],
      { feeMode: { mode: "sponsored" } }
    );

    expect(tx.transaction_hash).toBe("0xdeadbeef");
    expect(tx.recovered_from_rpc_error).toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [url, init] = fetchImpl.mock.calls[0] as [
      string,
      { body?: string; signal?: unknown } | undefined,
    ];
    expect(url).toBe("https://api.cartridge.gg/x/starknet/sepolia");
    expect(init?.signal).toBeDefined();

    const body = JSON.parse(String(init?.body ?? "{}")) as {
      method?: string;
      params?: {
        address?: string;
        outside_execution?: {
          caller?: string;
          nonce?: string[];
        };
        signature?: string[];
      };
    };
    expect(body.method).toBe("cartridge_addExecuteOutsideTransaction");
    expect(body.params?.address).toBe(
      "0x0000000000000000000000000000000000000000000000000000000000000abc"
    );
    expect(body.params?.outside_execution?.caller).toBe(
      "0x414e595f43414c4c4552"
    );
    expect(body.params?.outside_execution?.nonce?.[1]).toBe("0x1");
    expect(body.params?.signature?.[0]).toBe("0x73657373696f6e2d746f6b656e");
  });

  it("throws a clear error before RPC when calls are missing policy proofs", async () => {
    const fetchImpl = vi.fn();
    const adapter = createCartridgeTsAdapter({
      openSession: async () => ({
        status: "success",
        encodedSession: ENCODED_SESSION,
      }),
      fetchImpl,
    });

    const handle = await adapter.connect({
      rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
      chainId: "0x534e5f5345504f4c4941",
      policies: [{ target: "0x1", method: "create_game" }],
    });

    const error = await handle.account
      .execute(
        [
          {
            contractAddress:
              "0x0000000000000000000000000000000000000000000000000000000000000001",
            entrypoint: "join_game",
            calldata: [],
          },
          {
            contractAddress:
              "0x0000000000000000000000000000000000000000000000000000000000000002",
            entrypoint: "create_game",
            calldata: [],
          },
        ] as Call[],
        { feeMode: { mode: "sponsored" } }
      )
      .then(
        () => null,
        (caught) => caught
      );

    expect(error).toBeInstanceOf(SessionProtocolError);
    expect((error as Error).message).toBe(
      "Cannot execute from outside because session policy proofs are missing for: 0x0000000000000000000000000000000000000000000000000000000000000001#join_game, 0x0000000000000000000000000000000000000000000000000000000000000002#create_game."
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("clears the outside execution timeout after a successful fetch", async () => {
    vi.useFakeTimers();

    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        result: { transaction_hash: "0xdeadbeef" },
      }),
    });
    const adapter = createCartridgeTsAdapter({
      openSession: async () => ({
        status: "success",
        encodedSession: ENCODED_SESSION,
      }),
      fetchImpl,
      executeFromOutsideRequestTimeoutMs: 25,
    });

    const handle = await adapter.connect({
      rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
      chainId: "0x534e5f5345504f4c4941",
      policies: [{ target: "0x1", method: "create_game" }],
    });

    const tx = await handle.account.execute(
      [
        {
          contractAddress:
            "0x0000000000000000000000000000000000000000000000000000000000000001",
          entrypoint: "create_game",
          calldata: [],
        },
      ] as Call[],
      { feeMode: { mode: "sponsored" } }
    );

    expect(tx.transaction_hash).toBe("0xdeadbeef");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("treats aborted outside execution fetches as timeout errors", async () => {
    vi.useFakeTimers();

    const fetchImpl = vi.fn().mockImplementation(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_, reject) => {
          const signal = init?.signal;
          if (!signal) {
            reject(new Error("Missing abort signal"));
            return;
          }
          signal.addEventListener(
            "abort",
            () => {
              const error = new Error("The operation was aborted.");
              error.name = "AbortError";
              reject(error);
            },
            { once: true }
          );
        })
    );
    const adapter = createCartridgeTsAdapter({
      openSession: async () => ({
        status: "success",
        encodedSession: ENCODED_SESSION,
      }),
      fetchImpl,
      executeFromOutsideRequestTimeoutMs: 25,
    });

    const handle = await adapter.connect({
      rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
      chainId: "0x534e5f5345504f4c4941",
      policies: [{ target: "0x1", method: "create_game" }],
    });

    const executePromise = handle.account
      .execute(
        [
          {
            contractAddress:
              "0x0000000000000000000000000000000000000000000000000000000000000001",
            entrypoint: "create_game",
            calldata: [],
          },
        ] as Call[],
        { feeMode: { mode: "sponsored" } }
      )
      .catch((caught) => caught);

    await vi.advanceTimersByTimeAsync(25);

    const error = await executePromise;

    expect(error).toBeInstanceOf(SessionTimeoutError);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      "cartridge_addExecuteOutsideTransaction timed out after 25ms."
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it("times out outside execution fetches that ignore abort signals", async () => {
    vi.useFakeTimers();

    const fetchImpl = vi
      .fn()
      .mockImplementation(() => new Promise<never>(() => undefined));
    const adapter = createCartridgeTsAdapter({
      openSession: async () => ({
        status: "success",
        encodedSession: ENCODED_SESSION,
      }),
      fetchImpl,
      executeFromOutsideRequestTimeoutMs: 25,
    });

    const handle = await adapter.connect({
      rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
      chainId: "0x534e5f5345504f4c4941",
      policies: [{ target: "0x1", method: "create_game" }],
    });

    const executePromise = handle.account
      .execute(
        [
          {
            contractAddress:
              "0x0000000000000000000000000000000000000000000000000000000000000001",
            entrypoint: "create_game",
            calldata: [],
          },
        ] as Call[],
        { feeMode: { mode: "sponsored" } }
      )
      .catch((caught) => caught);

    await vi.advanceTimersByTimeAsync(25);

    const error = await executePromise;

    expect(error).toBeInstanceOf(SessionTimeoutError);
    expect((error as Error).message).toBe(
      "cartridge_addExecuteOutsideTransaction timed out after 25ms."
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(
      (fetchImpl.mock.calls[0] as [string, { signal?: unknown } | undefined])[1]
        ?.signal
    ).toBeDefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("recovers a transaction hash from JSON-RPC error data when Cartridge includes one", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        error: {
          message: "Transaction execution error",
          data: {
            transaction_hash: "0xdeadbeef",
          },
        },
      }),
    });
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const adapter = createCartridgeTsAdapter({
      openSession: async () => ({
        status: "success",
        encodedSession: ENCODED_SESSION,
      }),
      fetchImpl,
      logger,
    });

    const handle = await adapter.connect({
      rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
      chainId: "0x534e5f5345504f4c4941",
      policies: [{ target: "0x1", method: "create_game" }],
    });

    const tx = await handle.account.execute(
      [
        {
          contractAddress:
            "0x0000000000000000000000000000000000000000000000000000000000000001",
          entrypoint: "create_game",
          calldata: [],
        },
      ] as Call[],
      { feeMode: { mode: "sponsored" } }
    );

    expect(tx.transaction_hash).toBe("0xdeadbeef");
    expect(tx.recovered_from_rpc_error).toBe(true);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("throws when policies are missing or empty", async () => {
    const adapter = createCartridgeTsAdapter({
      openSession: async () => ({
        status: "success",
        encodedSession: ENCODED_SESSION,
      }),
    });

    await expect(
      adapter.connect({
        rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
        chainId: "0x534e5f5345504f4c4941",
        policies: [],
      } as Parameters<typeof adapter.connect>[0])
    ).rejects.toThrow(SessionProtocolError);

    await expect(
      adapter.connect({
        rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
        chainId: "0x534e5f5345504f4c4941",
        policies: undefined,
      } as Parameters<typeof adapter.connect>[0])
    ).rejects.toThrow(SessionProtocolError);
  });

  it("falls back to subscription when openSession returns status success but no session data", async () => {
    const subscribeSession = vi.fn().mockResolvedValue({
      username: "player1",
      address:
        "0x0000000000000000000000000000000000000000000000000000000000000abc",
      ownerGuid: "0x123",
      expiresAt: "4702444800",
      guardianKeyGuid: "0x0",
      metadataHash: "0x0",
      sessionKeyGuid: "0x999",
    });
    const adapter = createCartridgeTsAdapter({
      openSession: async () => ({
        status: "success",
      }),
      subscribeSession,
    });

    const handle = await adapter.connect({
      rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
      chainId: "0x534e5f5345504f4c4941",
      policies: [{ target: "0x1", method: "create_game" }],
    });

    expect(subscribeSession).toHaveBeenCalledTimes(1);
    expect(handle.account.address).toBe(
      "0x0000000000000000000000000000000000000000000000000000000000000abc"
    );
  });

  it("falls back to subscription when redirect payload is malformed", async () => {
    const subscribeSession = vi.fn().mockResolvedValue({
      username: "player1",
      address:
        "0x0000000000000000000000000000000000000000000000000000000000000abc",
      ownerGuid: "0x123",
      expiresAt: "4702444800",
      guardianKeyGuid: "0x0",
      metadataHash: "0x0",
      sessionKeyGuid: "0x999",
    });
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const malformedPayload = Buffer.from(
      JSON.stringify({ sessionKeyGuid: "0x999" }),
      "utf8"
    ).toString("base64url");

    const adapter = createCartridgeTsAdapter({
      openSession: async () => ({
        status: "success",
        encodedSession: malformedPayload,
      }),
      subscribeSession,
      logger,
    });

    const handle = await adapter.connect({
      rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
      chainId: "0x534e5f5345504f4c4941",
      policies: [{ target: "0x1", method: "create_game" }],
    });

    expect(subscribeSession).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(handle.account.address).toBe(
      "0x0000000000000000000000000000000000000000000000000000000000000abc"
    );
  });

  it("rethrows terminal redirect rejections without falling back", async () => {
    vi.spyOn(sessionApi, "parseSessionFromEncodedRedirect").mockImplementation(
      () => {
        throw new SessionRejectedError(
          "Cartridge session is revoked and cannot be used."
        );
      }
    );
    const subscribeSession = vi.fn();
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const adapter = createCartridgeTsAdapter({
      openSession: async () => ({
        status: "success",
        encodedSession: ENCODED_SESSION,
      }),
      subscribeSession,
      logger,
    });

    await expect(
      adapter.connect({
        rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
        chainId: "0x534e5f5345504f4c4941",
        policies: [{ target: "0x1", method: "create_game" }],
      })
    ).rejects.toThrow(SessionRejectedError);

    expect(subscribeSession).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("uses locally derived session key guid when redirect payload omits sessionKeyGuid", async () => {
    const partialPayload = Buffer.from(
      JSON.stringify({
        username: "player1",
        address: "0xabc",
        ownerGuid: "0x123",
        expiresAt: "4702444800",
      }),
      "utf8"
    ).toString("base64url");

    const adapter = createCartridgeTsAdapter({
      openSession: async () => ({
        status: "success",
        encodedSession: partialPayload,
      }),
    });

    const handle = await adapter.connect({
      rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
      chainId: "0x534e5f5345504f4c4941",
      policies: [{ target: "0x1", method: "create_game" }],
    });

    expect(handle.account.address).toBe(
      "0x0000000000000000000000000000000000000000000000000000000000000abc"
    );
  });

  it("connects and executes with outside->execute fallback", async () => {
    const executeFromOutside = vi
      .fn()
      .mockRejectedValue(new Error("manual execution required"));
    const execute = vi
      .fn()
      .mockResolvedValue({ transaction_hash: "0xfeedbeef" });

    const adapter = createCartridgeTsAdapter({
      openSession: async () => ({
        status: "success",
        encodedSession: ENCODED_SESSION,
      }),
      executeFromOutside,
      execute,
    });

    const handle = await adapter.connect({
      rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
      chainId: "0x534e5f5345504f4c4941",
      policies: [{ target: "0x1", method: "create_game" }],
      redirectUrl: "tictactoe://cartridge/callback",
    });

    expect(handle.account.address).toBe(
      "0x0000000000000000000000000000000000000000000000000000000000000abc"
    );

    const tx = await handle.account.execute(
      [
        {
          contractAddress:
            "0x0000000000000000000000000000000000000000000000000000000000000001",
          entrypoint: "create_game",
          calldata: [],
        },
      ] as Call[],
      { feeMode: { mode: "sponsored" } }
    );

    expect(tx.transaction_hash).toBe("0xfeedbeef");
    expect(executeFromOutside).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(await handle.username?.()).toBe("player1");
  });

  it("invalidates the returned session execute closure after disconnect", async () => {
    const executeFromOutside = vi
      .fn()
      .mockResolvedValue({ transaction_hash: "0xfeedbeef" });
    const adapter = createCartridgeTsAdapter({
      openSession: async () => ({
        status: "success",
        encodedSession: ENCODED_SESSION,
      }),
      executeFromOutside,
    });

    const handle = await adapter.connect({
      rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
      chainId: "0x534e5f5345504f4c4941",
      policies: [{ target: "0x1", method: "create_game" }],
    });

    const firstTx = await handle.account.execute(
      [
        {
          contractAddress:
            "0x0000000000000000000000000000000000000000000000000000000000000001",
          entrypoint: "create_game",
          calldata: [],
        },
      ] as Call[],
      { feeMode: { mode: "sponsored" } }
    );

    expect(firstTx.transaction_hash).toBe("0xfeedbeef");

    await handle.disconnect?.();

    await expect(
      handle.account.execute(
        [
          {
            contractAddress:
              "0x0000000000000000000000000000000000000000000000000000000000000001",
            entrypoint: "create_game",
            calldata: [],
          },
        ] as Call[],
        { feeMode: { mode: "sponsored" } }
      )
    ).rejects.toThrow(
      "Cartridge TS session has been disconnected and cannot execute transactions."
    );

    expect(executeFromOutside).toHaveBeenCalledTimes(1);
  });

  it("clears the session private key when disconnecting", async () => {
    const disconnectDescriptor = Object.getOwnPropertyDescriptor(
      TsSessionAccount.prototype,
      "disconnect"
    );
    const originalDisconnect = TsSessionAccount.prototype.disconnect;
    const disconnect = vi.fn(function (this: TsSessionAccount) {
      originalDisconnect.call(this);
      expect(
        (
          this as unknown as {
            sessionPrivateKey: string | null;
          }
        ).sessionPrivateKey
      ).toBeNull();
    });

    Object.defineProperty(TsSessionAccount.prototype, "disconnect", {
      configurable: true,
      value: disconnect,
    });

    try {
      const adapter = createCartridgeTsAdapter({
        openSession: async () => ({
          status: "success",
          encodedSession: ENCODED_SESSION,
        }),
        execute: async () => ({ transaction_hash: "0xfeedbeef" }),
      });

      const handle = await adapter.connect({
        rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
        chainId: "0x534e5f5345504f4c4941",
        policies: [{ target: "0x1", method: "create_game" }],
      });

      await handle.disconnect?.();
      await handle.disconnect?.();

      expect(disconnect).toHaveBeenCalledTimes(1);
    } finally {
      if (disconnectDescriptor) {
        Object.defineProperty(
          TsSessionAccount.prototype,
          "disconnect",
          disconnectDescriptor
        );
      }
    }
  });

  it("falls back to execute when outside execution returns SNIP-9 compatibility error", async () => {
    const executeFromOutside = vi
      .fn()
      .mockRejectedValue(new Error("Account is not compatible with SNIP-9"));
    const execute = vi
      .fn()
      .mockResolvedValue({ transaction_hash: "0xfeedbeef" });

    const adapter = createCartridgeTsAdapter({
      openSession: async () => ({
        status: "success",
        encodedSession: ENCODED_SESSION,
      }),
      executeFromOutside,
      execute,
    });

    const handle = await adapter.connect({
      rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
      chainId: "0x534e5f5345504f4c4941",
      policies: [{ target: "0x1", method: "create_game" }],
    });

    const tx = await handle.account.execute(
      [
        {
          contractAddress:
            "0x0000000000000000000000000000000000000000000000000000000000000001",
          entrypoint: "create_game",
          calldata: [],
        },
      ] as Call[],
      { feeMode: { mode: "sponsored" } }
    );

    expect(tx.transaction_hash).toBe("0xfeedbeef");
    expect(executeFromOutside).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("does not fallback to user-pays execution by default when outside execution fails", async () => {
    const executeFromOutside = vi
      .fn()
      .mockRejectedValue(
        new Error(
          "Failed to check if nonce is valid: Requested entrypoint does not exist"
        )
      );
    const adapter = createCartridgeTsAdapter({
      openSession: async () => ({
        status: "success",
        encodedSession: ENCODED_SESSION,
      }),
      executeFromOutside,
    });

    const handle = await adapter.connect({
      rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
      chainId: "0x534e5f5345504f4c4941",
      policies: [{ target: "0x1", method: "create_game" }],
    });

    await expect(
      handle.account.execute(
        [
          {
            contractAddress:
              "0x0000000000000000000000000000000000000000000000000000000000000001",
            entrypoint: "create_game",
            calldata: [],
          },
        ] as Call[],
        { feeMode: { mode: "sponsored" } }
      )
    ).rejects.toThrow(/entrypoint does not exist/i);
  });

  it("register helper wires adapter into the registry", () => {
    const adapter = registerCartridgeTsAdapter({
      execute: async () => ({ transaction_hash: "0x1" }),
    });

    expect(getCartridgeNativeAdapter()).toBe(adapter);
  });
});
