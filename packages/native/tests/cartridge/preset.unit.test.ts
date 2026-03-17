import { describe, expect, it, vi } from "vitest";
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
      "https://static.cartridge.gg/presets/index.json"
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://cdn.cartridge.gg/presets/tic-tac-toe/config.json"
    );
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
});
