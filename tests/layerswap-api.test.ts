import { afterEach, describe, expect, it, vi } from "vitest";
import { LayerswapApi } from "@/bridge/ethereum/layerswap/LayerswapApi";
import { LayerswapApiError } from "@/bridge/ethereum/layerswap/types";

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "OK",
    json: async () => body,
  } as unknown as Response;
}

describe("LayerswapApi.unwrap", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports a null body as a LayerswapApiError, not a TypeError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(null)));
    const api = new LayerswapApi({ apiKey: "k" });

    const error = await api
      .getSources({ destinationNetwork: "STARKNET_MAINNET" })
      .then(
        () => null,
        (e: unknown) => e
      );
    expect(error).toBeInstanceOf(LayerswapApiError);
    expect((error as Error).message).toContain("non-object body (HTTP 200)");
  });

  it("still returns data from a well-formed envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(response({ data: [{ name: "X" }], error: null }))
    );
    const api = new LayerswapApi({ apiKey: "k" });

    await expect(
      api.getSources({ destinationNetwork: "STARKNET_MAINNET" })
    ).resolves.toEqual([{ name: "X" }]);
  });
});
