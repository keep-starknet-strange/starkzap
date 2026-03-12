import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Call } from "starknet";
import {
  clearCartridgeNativeAdapter,
  getCartridgeNativeAdapter,
} from "@/cartridge/registry";
import {
  createCartridgeTsAdapter,
  registerCartridgeTsAdapter,
} from "@/cartridge/ts";
import { SessionProtocolError } from "@/cartridge/ts/errors";

const ENCODED_SESSION =
  "eyJ1c2VybmFtZSI6InBsYXllcjEiLCJhZGRyZXNzIjoiMHhhYmMiLCJvd25lckd1aWQiOiIweDEyMyIsImV4cGlyZXNBdCI6IjQ3MDI0NDQ4MDAiLCJndWFyZGlhbktleUd1aWQiOiIweDAiLCJtZXRhZGF0YUhhc2giOiIweDAiLCJzZXNzaW9uS2V5R3VpZCI6IjB4OTk5In0=";

describe("cartridge ts adapter", () => {
  beforeEach(() => {
    clearCartridgeNativeAdapter();
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

    const tx = await handle.account.executePaymasterTransaction([
      {
        contractAddress:
          "0x0000000000000000000000000000000000000000000000000000000000000001",
        entrypoint: "create_game",
        calldata: [],
      },
    ] as Call[]);

    expect(tx.transaction_hash).toBe("0xdeadbeef");
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [url, init] = fetchImpl.mock.calls[0] as [
      string,
      { body?: string } | undefined,
    ];
    expect(url).toBe("https://api.cartridge.gg/x/starknet/sepolia");

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

    const tx = await handle.account.executePaymasterTransaction([
      {
        contractAddress:
          "0x0000000000000000000000000000000000000000000000000000000000000001",
        entrypoint: "create_game",
        calldata: [],
      },
    ] as Call[]);

    expect(tx.transaction_hash).toBe("0xfeedbeef");
    expect(executeFromOutside).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(await handle.username?.()).toBe("player1");
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

    const tx = await handle.account.executePaymasterTransaction([
      {
        contractAddress:
          "0x0000000000000000000000000000000000000000000000000000000000000001",
        entrypoint: "create_game",
        calldata: [],
      },
    ] as Call[]);

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
      handle.account.executePaymasterTransaction([
        {
          contractAddress:
            "0x0000000000000000000000000000000000000000000000000000000000000001",
          entrypoint: "create_game",
          calldata: [],
        },
      ] as Call[])
    ).rejects.toThrow(/entrypoint does not exist/i);
  });

  it("register helper wires adapter into the registry", () => {
    const adapter = registerCartridgeTsAdapter({
      execute: async () => ({ transaction_hash: "0x1" }),
    });

    expect(getCartridgeNativeAdapter()).toBe(adapter);
  });
});
