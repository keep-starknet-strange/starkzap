import { describe, expect, expectTypeOf, it } from "vitest";
import { policiesToSessionUrlShape } from "@/cartridge/ts/policy";
import { SessionProtocolError } from "@/cartridge/ts/errors";
import type {
  CartridgePolicyMethod,
  CartridgePolicyMethodInput,
  CartridgeSessionPolicies,
} from "@/cartridge/types";

const CONTRACT_KEY = "0x1";

function withMethod(
  method: CartridgePolicyMethodInput
): CartridgeSessionPolicies {
  return {
    contracts: {
      [CONTRACT_KEY]: {
        methods: [method],
      },
    },
  };
}

function firstContractMethod(
  policies: CartridgeSessionPolicies
): CartridgePolicyMethod {
  const contracts = policiesToSessionUrlShape(policies).contracts;
  if (!contracts) {
    throw new Error("expected contracts");
  }
  const address = Object.keys(contracts)[0];
  if (!address) {
    throw new Error("expected contract address key");
  }
  const method = contracts[address]?.methods[0];
  if (!method) {
    throw new Error("expected method");
  }
  return method;
}

describe("policiesToSessionUrlShape method normalization", () => {
  it("omits unset optional fields from normalized output", () => {
    const out = firstContractMethod(
      withMethod({
        entrypoint: "transfer",
      })
    );
    expect(out).toEqual({ entrypoint: "transfer" });
    expect(Object.keys(out).sort()).toEqual(["entrypoint"]);
  });

  it("normalizes snake_case-only input to camelCase on output", () => {
    const out = firstContractMethod(
      withMethod({
        entrypoint: "transfer",
        is_enabled: true,
        is_required: false,
        is_paymastered: true,
      })
    );
    expect(out).toEqual({
      entrypoint: "transfer",
      isEnabled: true,
      isRequired: false,
      isPaymastered: true,
    });
    expect(out).not.toHaveProperty("is_enabled");
    expect(out).not.toHaveProperty("is_required");
    expect(out).not.toHaveProperty("is_paymastered");
  });

  it("prefers camelCase when both spellings are present (camelCase wins)", () => {
    const out = firstContractMethod(
      withMethod({
        entrypoint: "transfer",
        isEnabled: true,
        is_enabled: false,
        isRequired: false,
        is_required: true,
      })
    );
    expect(out.isEnabled).toBe(true);
    expect(out.isRequired).toBe(false);
  });

  it("prefers camelCase isPaymastered when both spellings are present", () => {
    const out = firstContractMethod(
      withMethod({
        entrypoint: "transfer",
        isPaymastered: false,
        is_paymastered: { address: "0x2", entrypoint: "check" },
      })
    );
    expect(out.isPaymastered).toBe(false);
    expect(typeof out.isPaymastered).toBe("boolean");
  });

  it("supports isPaymastered boolean", () => {
    const out = firstContractMethod(
      withMethod({ entrypoint: "transfer", isPaymastered: false })
    );
    expect(out.isPaymastered).toBe(false);
  });

  it("supports isPaymastered as predicate object", () => {
    const out = firstContractMethod(
      withMethod({
        entrypoint: "transfer",
        isPaymastered: {
          address: "0x2",
          entrypoint: "check",
        },
      })
    );
    expect(typeof out.isPaymastered).toBe("object");
    expect(out.isPaymastered).toEqual({
      address: expect.stringMatching(/^0x[0-9a-f]+$/u),
      entrypoint: "check",
    });
  });

  it("supports predicate alias and folds into isPaymastered", () => {
    const out = firstContractMethod(
      withMethod({
        entrypoint: "transfer",
        predicate: { address: "0x2", entrypoint: "check" },
      })
    );
    expect(typeof out.isPaymastered).toBe("object");
    expect(out.isPaymastered).toEqual({
      address: expect.stringMatching(/^0x[0-9a-f]+$/u),
      entrypoint: "check",
    });
    expect(out).not.toHaveProperty("predicate");
  });

  it("supports is_paymastered as predicate object (compatibility input)", () => {
    const out = firstContractMethod(
      withMethod({
        entrypoint: "transfer",
        is_paymastered: { address: "0x2", entrypoint: "check" },
      })
    );
    expect(typeof out.isPaymastered).toBe("object");
    expect(out.isPaymastered).toEqual({
      address: expect.stringMatching(/^0x[0-9a-f]+$/u),
      entrypoint: "check",
    });
    expect(out).not.toHaveProperty("predicate");
  });

  it("rejects predicate when isPaymastered is false (normalizeMethodForUrl guard)", () => {
    expect(() =>
      policiesToSessionUrlShape(
        withMethod({
          entrypoint: "transfer",
          isPaymastered: false,
          predicate: { address: "0x2", entrypoint: "check" },
        })
      )
    ).toThrow(SessionProtocolError);
  });

  it("typing: lightweight regression for input vs canonical (see implementation for source of truth)", () => {
    const snakeCaseOnly = {
      entrypoint: "x",
      is_enabled: true,
    };

    expectTypeOf(snakeCaseOnly).toExtend<CartridgePolicyMethodInput>();
    expectTypeOf(snakeCaseOnly).not.toEqualTypeOf<CartridgePolicyMethod>();
  });
});
