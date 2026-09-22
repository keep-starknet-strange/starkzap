import { describe, expect, it } from "vitest";
import {
  buildDummyStarknetTransferCalls,
  parseLayerswapStarknetCalls,
} from "@/bridge/ethereum/layerswap/starknet";
import type { LsDepositAction } from "@/bridge/ethereum/layerswap/types";
import { fromAddress } from "@/types";

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

describe("parseLayerswapStarknetCalls", () => {
  it("accepts a single Call object", () => {
    const calls = parseLayerswapStarknetCalls(
      action(JSON.stringify(transferCall())),
      TOKEN
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]!.entrypoint).toBe("transfer");
  });

  it("accepts a Call[] array", () => {
    const calls = parseLayerswapStarknetCalls(
      action(JSON.stringify([transferCall(), transferCall()])),
      TOKEN
    );
    expect(calls).toHaveLength(2);
  });

  it("normalises Starknet addresses to felt-padded form before comparing", () => {
    const shortToken =
      "0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"; // missing leading zero
    const calls = parseLayerswapStarknetCalls(
      action(JSON.stringify(transferCall(shortToken))),
      TOKEN
    );
    expect(calls).toHaveLength(1);
  });

  it("rejects missing call_data", () => {
    expect(() => parseLayerswapStarknetCalls(action(null), TOKEN)).toThrow(
      /no call_data/
    );
  });

  it("rejects malformed JSON", () => {
    expect(() =>
      parseLayerswapStarknetCalls(action("{not json"), TOKEN)
    ).toThrow(/Failed to parse/);
  });

  it("rejects empty array", () => {
    expect(() =>
      parseLayerswapStarknetCalls(action(JSON.stringify([])), TOKEN)
    ).toThrow(/no Starknet calls/);
  });

  it("rejects entries missing required fields", () => {
    expect(() =>
      parseLayerswapStarknetCalls(
        action(JSON.stringify({ contractAddress: TOKEN })),
        TOKEN
      )
    ).toThrow(/missing required Call fields/);
  });

  describe("calls to other contracts", () => {
    const helperCall = {
      contractAddress: RECIPIENT,
      entrypoint: "deposit",
      calldata: ["0x4", "0x5"],
    };
    const payload = action(JSON.stringify([transferCall(), helperCall]));

    it("rejects them when no contract is allowed", () => {
      // The wallet signs whatever comes back, so an unvetted call is refused
      // before signing, naming the address and the config key.
      expect(() => parseLayerswapStarknetCalls(payload, TOKEN)).toThrow(
        /calls 0x064b4880.*not in `bridging.layerswapAllowedContracts`/
      );
      expect(() => parseLayerswapStarknetCalls(payload, TOKEN, [])).toThrow(
        /not in `bridging.layerswapAllowedContracts`/
      );
    });

    it("rejects an approve on another token, the report's drain scenario", () => {
      const drain = {
        contractAddress: "0x0abc",
        entrypoint: "approve",
        calldata: ["0xdead", "0xffff", "0xffff"],
      };
      expect(() =>
        parseLayerswapStarknetCalls(
          action(JSON.stringify([drain, transferCall()])),
          TOKEN,
          [fromAddress(RECIPIENT)]
        )
      ).toThrow(/entry 0 calls 0x0abc \(entrypoint "approve"\)/);
    });

    it("accepts them when the contract is listed, compared by value", () => {
      const shortForm = fromAddress(RECIPIENT.replace("0x0", "0x"));
      const calls = parseLayerswapStarknetCalls(payload, TOKEN, [shortForm]);
      expect(calls).toEqual([transferCall(), helperCall]);
    });

    it("does not let a listed bridge token open other entrypoints on it", () => {
      expect(() =>
        parseLayerswapStarknetCalls(
          action(
            JSON.stringify([transferCall(), transferCall(TOKEN, "approve")])
          ),
          TOKEN,
          [fromAddress(TOKEN)]
        )
      ).toThrow(/unexpected bridge-token entrypoint/);
    });
  });

  it("rejects payloads without a transfer on the expected token", () => {
    // The other contract is allowed so the payload reaches this check rather
    // than being refused as an unlisted call.
    expect(() =>
      parseLayerswapStarknetCalls(
        action(JSON.stringify(transferCall(RECIPIENT))),
        TOKEN,
        [fromAddress(RECIPIENT)]
      )
    ).toThrow(/does not include a transfer/);
  });

  it("rejects bridge-token calls with an unexpected entrypoint", () => {
    expect(() =>
      parseLayerswapStarknetCalls(
        action(JSON.stringify(transferCall(TOKEN, "approve"))),
        TOKEN
      )
    ).toThrow(/unexpected bridge-token entrypoint/);
  });

  it("rejects mixed-validity arrays when a bridge-token call is not a transfer", () => {
    expect(() =>
      parseLayerswapStarknetCalls(
        action(
          JSON.stringify([transferCall(), transferCall(TOKEN, "approve")])
        ),
        TOKEN
      )
    ).toThrow(/unexpected bridge-token entrypoint/);
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
