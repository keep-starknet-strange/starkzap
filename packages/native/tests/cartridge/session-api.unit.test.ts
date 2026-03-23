import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SessionProtocolError,
  SessionRejectedError,
  SessionTimeoutError,
} from "@/cartridge/ts/errors";
import { waitForSessionSubscription } from "@/cartridge/ts/session_api";

describe("waitForSessionSubscription", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("caps each request timeout to the remaining overall timeout budget", async () => {
    vi.useFakeTimers();

    const fetchImpl = vi
      .fn()
      .mockImplementation(() => new Promise<never>(() => undefined));

    const waitPromise = waitForSessionSubscription({
      cartridgeApiUrl: "https://api.cartridge.gg/graphql",
      sessionKeyGuid: "0x123",
      timeoutMs: 50,
      requestTimeoutMs: 200,
      fetchImpl,
    }).catch((error) => error);

    await vi.advanceTimersByTimeAsync(50);

    const error = await waitPromise;

    expect(error).toBeInstanceOf(SessionTimeoutError);
    expect((error as Error).message).toBe(
      "Timed out waiting for Cartridge session subscription result."
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(
      (
        error as Error & {
          cause?: unknown;
        }
      ).cause
    ).toBeInstanceOf(SessionProtocolError);
    expect(
      (
        (
          error as Error & {
            cause?: Error;
          }
        ).cause as Error
      ).message
    ).toBe("Cartridge session subscription request timed out after 50ms.");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("caps poll backoff to the remaining overall timeout budget", async () => {
    vi.useFakeTimers();

    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        data: {
          subscribeCreateSession: null,
        },
      }),
    });

    const waitPromise = waitForSessionSubscription({
      cartridgeApiUrl: "https://api.cartridge.gg/graphql",
      sessionKeyGuid: "0x123",
      timeoutMs: 200,
      requestTimeoutMs: 150,
      fetchImpl,
    }).catch((error) => error);

    await vi.advanceTimersByTimeAsync(200);

    const error = await waitPromise;

    expect(error).toBeInstanceOf(SessionTimeoutError);
    expect((error as Error).message).toBe(
      "Timed out waiting for Cartridge session subscription result."
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("maps the current GraphQL subscription payload shape to the supported session shape", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        data: {
          subscribeCreateSession: {
            appID: "app-1",
            chainID: "SN_SEPOLIA",
            isRevoked: false,
            controller: {
              address: "0xabc",
              accountID: "player1",
            },
            expiresAt: "4702444800",
            metadataHash: "0x0",
            sessionKeyGuid: "0x999",
            guardianKeyGuid: "0x0",
            authorization: ["0xdead", "0x123"],
          },
        },
      }),
    });

    await expect(
      waitForSessionSubscription({
        cartridgeApiUrl: "https://api.cartridge.gg/graphql",
        sessionKeyGuid: "0x123",
        fetchImpl,
      })
    ).resolves.toEqual({
      username: "player1",
      address:
        "0x0000000000000000000000000000000000000000000000000000000000000abc",
      ownerGuid: "0x123",
      expiresAt: "4702444800",
      guardianKeyGuid: "0x0",
      metadataHash: "0x0",
      sessionKeyGuid: "0x999",
      authorization: ["0xdead", "0x123"],
      chainId: "SN_SEPOLIA",
      appId: "app-1",
      isRevoked: false,
    });
  });

  it("throws SessionRejectedError immediately when the session is revoked", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        data: {
          subscribeCreateSession: {
            appID: "app-1",
            chainID: "SN_SEPOLIA",
            isRevoked: true,
            controller: {
              address: "0xabc",
              accountID: "player1",
            },
            expiresAt: "4702444800",
            metadataHash: "0x0",
            sessionKeyGuid: "0x999",
            guardianKeyGuid: "0x0",
            authorization: ["0xdead", "0x123"],
          },
        },
      }),
    });

    await expect(
      waitForSessionSubscription({
        cartridgeApiUrl: "https://api.cartridge.gg/graphql",
        sessionKeyGuid: "0x123",
        fetchImpl,
      })
    ).rejects.toThrow(SessionRejectedError);

    await expect(
      waitForSessionSubscription({
        cartridgeApiUrl: "https://api.cartridge.gg/graphql",
        sessionKeyGuid: "0x123",
        fetchImpl,
      })
    ).rejects.toThrow("Cartridge session is revoked and cannot be used.");

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws SessionRejectedError immediately when the session is missing owner GUID", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        data: {
          subscribeCreateSession: {
            isRevoked: false,
            controller: {
              address: "0xabc",
              accountID: "player1",
            },
            expiresAt: "4702444800",
            metadataHash: "0x0",
            sessionKeyGuid: "0x999",
            guardianKeyGuid: "0x0",
            authorization: [],
          },
        },
      }),
    });

    await expect(
      waitForSessionSubscription({
        cartridgeApiUrl: "https://api.cartridge.gg/graphql",
        sessionKeyGuid: "0x123",
        fetchImpl,
      })
    ).rejects.toThrow(SessionRejectedError);

    await expect(
      waitForSessionSubscription({
        cartridgeApiUrl: "https://api.cartridge.gg/graphql",
        sessionKeyGuid: "0x123",
        fetchImpl,
      })
    ).rejects.toThrow("missing owner GUID authorization");
  });

  it("throws SessionRejectedError immediately on GraphQL errors", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        errors: [{ message: "Rate limited" }, { message: "Try again later" }],
      }),
    });

    const error = await waitForSessionSubscription({
      cartridgeApiUrl: "https://api.cartridge.gg/graphql",
      sessionKeyGuid: "0x123",
      fetchImpl,
    }).catch((caught) => caught);

    expect(error).toBeInstanceOf(SessionRejectedError);
    expect((error as Error).message).toContain("Rate limited; Try again later");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid cartridgeApiUrl values before issuing subscription fetches", async () => {
    const fetchImpl = vi.fn();

    const error = await waitForSessionSubscription({
      cartridgeApiUrl: "ftp://api.cartridge.gg/graphql",
      sessionKeyGuid: "0x123",
      fetchImpl,
    }).catch((caught) => caught);

    expect((error as Error).message).toBe(
      "cartridgeApiUrl must use http:// or https://"
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
