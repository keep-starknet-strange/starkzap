import { constants } from "starknet";
import { describe, expect, it } from "vitest";
import { ChainId } from "@/types";

describe("ChainId.fromFelt252", () => {
  it("decodes supported chain ids", () => {
    expect(
      ChainId.fromFelt252(constants.StarknetChainId.SN_MAIN).toLiteral()
    ).toBe("SN_MAIN");
    expect(
      ChainId.fromFelt252(constants.StarknetChainId.SN_SEPOLIA).toLiteral()
    ).toBe("SN_SEPOLIA");
  });

  it("rejects malformed chain felt inputs as unsupported chain ids", () => {
    expect(() => ChainId.fromFelt252("0x534e5f4d41494g")).toThrow(
      'Unsupported chain ID: "0x534e5f4d41494g"'
    );
    expect(() => ChainId.fromFelt252(" 0x534e5f4d41494e00")).toThrow(
      'Unsupported chain ID: " 0x534e5f4d41494e00"'
    );
  });
});
