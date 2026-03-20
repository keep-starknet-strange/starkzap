import { afterEach, describe, expect, it, vi } from "vitest";
import type { CartridgeSessionPolicies } from "@/cartridge/types";
import { SessionProtocolError } from "@/cartridge/ts/errors";
import { resolvePresetPolicies } from "@/cartridge/ts/preset";

function jsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => payload,
  };
}

describe("cartridge preset resolution", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves policies when preset payloads match the expected shape", async () => {
    const policies: CartridgeSessionPolicies = {
      contracts: {
        "0x1": {
          methods: [{ entrypoint: "create_game" }],
        },
      },
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ baseUrl: "https://cdn.cartridge.gg/presets" })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          chains: {
            SN_SEPOLIA: { policies },
          },
        })
      );

    await expect(
      resolvePresetPolicies({
        preset: "tic-tac-toe",
        chainId: "0x534e5f5345504f4c4941",
        fetchImpl,
        presetBaseUrl: "https://static.cartridge.gg/presets",
      })
    ).resolves.toEqual(policies);

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://static.cartridge.gg/presets/index.json",
      expect.objectContaining({
        signal: expect.anything(),
      })
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://cdn.cartridge.gg/presets/tic-tac-toe/config.json",
      expect.objectContaining({
        signal: expect.anything(),
      })
    );
  });

  it("rejects preset index redirects to untrusted hosts", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ baseUrl: "https://attacker.example/presets" })
      );
    const promise = resolvePresetPolicies({
      preset: "tic-tac-toe",
      chainId: "SN_SEPOLIA",
      fetchImpl,
      presetBaseUrl: "https://static.cartridge.gg/presets",
    });

    await expect(promise).rejects.toThrow(SessionProtocolError);
    await expect(promise).rejects.toThrow(
      'Loading Cartridge preset index returned an untrusted baseUrl "https://attacker.example/presets".'
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws a protocol error when the preset index payload is invalid", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ baseUrl: 123 }));
    const promise = resolvePresetPolicies({
      preset: "tic-tac-toe",
      chainId: "SN_SEPOLIA",
      fetchImpl,
    });

    await expect(promise).rejects.toThrow(SessionProtocolError);
    await expect(promise).rejects.toThrow(
      'Loading Cartridge preset index returned an invalid JSON payload: {"baseUrl":123}.'
    );
  });

  it("throws a protocol error when the preset config payload is invalid", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(
        jsonResponse({
          chains: {
            SN_SEPOLIA: {
              policies: "invalid",
            },
          },
        })
      );
    const promise = resolvePresetPolicies({
      preset: "tic-tac-toe",
      chainId: "SN_SEPOLIA",
      fetchImpl,
    });

    await expect(promise).rejects.toThrow(SessionProtocolError);
    await expect(promise).rejects.toThrow(
      'Loading Cartridge preset "tic-tac-toe" returned an invalid JSON payload: {"chains":{"SN_SEPOLIA":{"policies":"invalid"}}}.'
    );
  });

  it("times out stalled preset requests and wraps the timeout with context", async () => {
    vi.useFakeTimers();

    const fetchImpl = vi
      .fn()
      .mockImplementation(() => new Promise<never>(() => undefined));

    const promise = resolvePresetPolicies({
      preset: "tic-tac-toe",
      chainId: "SN_SEPOLIA",
      fetchImpl,
    }).catch((caught) => caught);

    await vi.advanceTimersByTimeAsync(15_000);

    const error = await promise;

    expect(error).toBeInstanceOf(SessionProtocolError);
    expect((error as Error).message).toBe(
      "Loading Cartridge preset index failed: Cartridge preset request timed out after 15000ms."
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://static.cartridge.gg/presets/index.json",
      expect.objectContaining({
        signal: expect.anything(),
      })
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it("wraps low-level preset transport failures in a protocol error", async () => {
    const transportError = new Error("network down");
    const fetchImpl = vi.fn().mockRejectedValue(transportError);

    const error = await resolvePresetPolicies({
      preset: "tic-tac-toe",
      chainId: "SN_SEPOLIA",
      fetchImpl,
    }).catch((caught) => caught);

    expect(error).toBeInstanceOf(SessionProtocolError);
    expect((error as Error).message).toBe(
      "Loading Cartridge preset index failed: network down."
    );
    expect((error as Error & { cause?: unknown }).cause).toBe(transportError);
  });

  it("rejects invalid preset base URLs before loading the preset index", async () => {
    const fetchImpl = vi.fn();

    const error = await resolvePresetPolicies({
      preset: "tic-tac-toe",
      chainId: "SN_SEPOLIA",
      fetchImpl,
      presetBaseUrl: "ftp://static.cartridge.gg/presets",
    }).catch((caught) => caught);

    expect(error).toBeInstanceOf(SessionProtocolError);
    expect((error as Error).message).toBe(
      "Configured Cartridge preset base URL is invalid: ftp://static.cartridge.gg/presets."
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
