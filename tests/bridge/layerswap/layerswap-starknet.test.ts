import { describe, expect, it } from "vitest";
import {
  buildDummyStarknetTransferCalls,
  parseLayerSwapStarknetCalls,
} from "@/bridge/ethereum/layerswap/starknet";
import type { LsDepositAction } from "@/bridge/ethereum/layerswap/types";

const TOKEN =
  "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
const RECIPIENT =
  "0x064b48806902a367c8598f4f95c305e8c1a1acba5f082d294a43793113115691";

function action(callData: string | null): LsDepositAction {
  return {
    type: "transfer",
    amount: 0,
    amount_in_base_units: "0",
    order: 1,
    network: { name: "STARKNET_SEPOLIA" } as LsDepositAction["network"],
    token: { contract: null } as LsDepositAction["token"],
    call_data: callData,
  };
}

function transferCall(contract: string = TOKEN, entrypoint = "transfer") {
  return {
    contractAddress: contract,
    entrypoint,
    calldata: ["0x1", "0x2", "0x3"],
  };
}

describe("parseLayerSwapStarknetCalls", () => {
  it("accepts a single Call object", () => {
    const calls = parseLayerSwapStarknetCalls(
      action(JSON.stringify(transferCall())),
      TOKEN
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]!.entrypoint).toBe("transfer");
  });

  it("accepts a Call[] array", () => {
    const calls = parseLayerSwapStarknetCalls(
      action(JSON.stringify([transferCall(), transferCall()])),
      TOKEN
    );
    expect(calls).toHaveLength(2);
  });

  it("normalises Starknet addresses to felt-padded form before comparing", () => {
    const shortToken =
      "0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"; // missing leading zero
    const calls = parseLayerSwapStarknetCalls(
      action(JSON.stringify(transferCall(shortToken))),
      TOKEN
    );
    expect(calls).toHaveLength(1);
  });

  it("rejects missing call_data", () => {
    expect(() => parseLayerSwapStarknetCalls(action(null), TOKEN)).toThrow(
      /no call_data/
    );
  });

  it("rejects malformed JSON", () => {
    expect(() =>
      parseLayerSwapStarknetCalls(action("{not json"), TOKEN)
    ).toThrow(/Failed to parse/);
  });

  it("rejects empty array", () => {
    expect(() =>
      parseLayerSwapStarknetCalls(action(JSON.stringify([])), TOKEN)
    ).toThrow(/no Starknet calls/);
  });

  it("rejects entries missing required fields", () => {
    expect(() =>
      parseLayerSwapStarknetCalls(
        action(JSON.stringify({ contractAddress: TOKEN })),
        TOKEN
      )
    ).toThrow(/missing required Call fields/);
  });

  it("rejects calls targeting an unexpected contract", () => {
    expect(() =>
      parseLayerSwapStarknetCalls(
        action(JSON.stringify(transferCall(RECIPIENT))),
        TOKEN
      )
    ).toThrow(/unexpected contract/);
  });

  it("rejects calls with an unexpected entrypoint", () => {
    expect(() =>
      parseLayerSwapStarknetCalls(
        action(JSON.stringify(transferCall(TOKEN, "approve"))),
        TOKEN
      )
    ).toThrow(/unexpected entrypoint/);
  });

  it("rejects mixed-validity arrays even if the first call is valid", () => {
    expect(() =>
      parseLayerSwapStarknetCalls(
        action(
          JSON.stringify([transferCall(), transferCall(TOKEN, "approve")])
        ),
        TOKEN
      )
    ).toThrow(/unexpected entrypoint/);
  });
});

describe("buildDummyStarknetTransferCalls", () => {
  it("returns a single transfer call on the given token", () => {
    const calls = buildDummyStarknetTransferCalls(TOKEN);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.contractAddress).toBe(TOKEN);
    expect(calls[0]!.entrypoint).toBe("transfer");
  });
});
