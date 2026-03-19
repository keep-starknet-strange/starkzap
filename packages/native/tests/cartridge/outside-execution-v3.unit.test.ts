import { describe, expect, it, vi } from "vitest";

const { FIXED_NONCE } = vi.hoisted(() => ({
  FIXED_NONCE: "0xdeadbeef",
}));

vi.mock("starknet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("starknet")>();
  return {
    ...actual,
    stark: {
      ...actual.stark,
      randomAddress: () => FIXED_NONCE,
    },
  };
});

import { addAddressPadding, ec, hash, num, type Call } from "starknet";
import { SessionProtocolError } from "@/cartridge/ts/errors";
import {
  buildSignedOutsideExecutionV3,
  type BuildSignedOutsideExecutionV3Args,
} from "@/cartridge/ts/outside_execution_v3";
import type { SessionRegistration } from "@/cartridge/ts/session_api";

const SESSION_PRIVATE_KEY = "0x1234";
const POLICY_ROOT = "0x5678";
const FALLBACK_SESSION_KEY_GUID = "0x999";
const ZERO_FELT = "0x0";
const ONE_FELT = "0x1";
const TWO_FELT = "0x2";
const AUTHORIZATION_BY_REGISTERED =
  "0x617574686f72697a6174696f6e2d62792d72656769737465726564";
const SESSION_TOKEN_MAGIC = "0x73657373696f6e2d746f6b656e";

const BASE_SESSION: SessionRegistration = {
  username: "arthur_dent",
  address: "0xabc",
  ownerGuid: "0x123",
  expiresAt: "4702444800",
  guardianKeyGuid: "0x456",
  metadataHash: "0x789",
  sessionKeyGuid: "0x987",
};
const SESSION_EXPIRES_AT = normalizeFelt(BASE_SESSION.expiresAt);

function normalizeFelt(value: string | number | bigint): string {
  return num.toHex(value).toLowerCase();
}

function normalizedAddress(address: string): string {
  return addAddressPadding(address.toLowerCase());
}

function policyKey(contractAddress: string, selector: string): string {
  return `${normalizedAddress(contractAddress)}:${normalizeFelt(selector)}`;
}

function createArgs(
  overrides: Partial<BuildSignedOutsideExecutionV3Args> = {}
): BuildSignedOutsideExecutionV3Args {
  const askDeepThoughtSelector = normalizeFelt(
    hash.getSelectorFromName("ask_deep_thought")
  );
  const policyProofIndex = new Map<string, string[]>([
    [policyKey("0x1", askDeepThoughtSelector), ["0xaaa"]],
    [policyKey("0x2", "0xabc"), ["0xbbb", "0xccc"]],
  ]);

  return {
    calls: [
      {
        contractAddress: "0x1",
        entrypoint: "ask_deep_thought",
        calldata: ["1", "0x2"],
      },
      {
        contractAddress: "0x2",
        entrypoint: "0xAbC",
        calldata: ["0x3"],
      },
    ] as Call[],
    details: {
      feeMode: { mode: "sponsored" },
      timeBounds: {
        executeAfter: 120,
        executeBefore: 240,
      },
    },
    chainId: "SN_SEPOLIA",
    session: BASE_SESSION,
    sessionPrivateKey: SESSION_PRIVATE_KEY,
    policyRoot: POLICY_ROOT,
    sessionKeyGuid: FALLBACK_SESSION_KEY_GUID,
    policyProofIndex,
    nowSeconds: 100,
    ...overrides,
  };
}

describe("buildSignedOutsideExecutionV3", () => {
  it("builds a deterministic outside execution payload and serializes proofs in call order", () => {
    const result = buildSignedOutsideExecutionV3(createArgs());
    const sessionPubkey = normalizeFelt(
      ec.starkCurve.getStarkKey(SESSION_PRIVATE_KEY)
    );
    const expectedSessionStruct = [
      SESSION_EXPIRES_AT,
      POLICY_ROOT,
      BASE_SESSION.metadataHash,
      BASE_SESSION.sessionKeyGuid,
      BASE_SESSION.guardianKeyGuid,
    ];
    const expectedAuthorization = [
      ONE_FELT,
      TWO_FELT,
      AUTHORIZATION_BY_REGISTERED,
      BASE_SESSION.ownerGuid,
    ];
    const expectedSerializedProofs = [
      TWO_FELT,
      ONE_FELT,
      "0xaaa",
      TWO_FELT,
      "0xbbb",
      "0xccc",
    ];

    expect(result.outsideExecution).toEqual({
      caller: "0x414e595f43414c4c4552",
      nonce: [FIXED_NONCE, ONE_FELT],
      execute_after: "0x78",
      execute_before: "0xf0",
      calls: [
        {
          to: normalizedAddress("0x1"),
          selector: normalizeFelt(hash.getSelectorFromName("ask_deep_thought")),
          calldata: ["0x1", "0x2"],
        },
        {
          to: normalizedAddress("0x2"),
          selector: "0xabc",
          calldata: ["0x3"],
        },
      ],
    });

    expect(result.signature[0]).toBe(SESSION_TOKEN_MAGIC);
    expect(result.signature.slice(1, 6)).toEqual(expectedSessionStruct);
    expect(result.signature.slice(6, 10)).toEqual(expectedAuthorization);
    expect(result.signature.slice(10, 12)).toEqual([ZERO_FELT, sessionPubkey]);
    expect(result.signature[14]).toBe(ZERO_FELT);
    expect(result.signature.slice(-expectedSerializedProofs.length)).toEqual(
      expectedSerializedProofs
    );
  });

  it("defaults the outside execution window when no time bounds are provided", () => {
    const result = buildSignedOutsideExecutionV3(
      createArgs({
        details: {
          feeMode: { mode: "sponsored" },
        },
        nowSeconds: 1_000,
      })
    );

    expect(result.outsideExecution.nonce).toEqual([FIXED_NONCE, ONE_FELT]);
    expect(result.outsideExecution.execute_after).toBe(ZERO_FELT);
    expect(result.outsideExecution.execute_before).toBe("0x640");
  });

  it("falls back to the provided session key guid and zero defaults for optional session fields", () => {
    const sessionWithoutOptionalFields = {
      username: BASE_SESSION.username,
      address: BASE_SESSION.address,
      ownerGuid: BASE_SESSION.ownerGuid,
      expiresAt: BASE_SESSION.expiresAt,
    } as unknown as SessionRegistration;
    const result = buildSignedOutsideExecutionV3(
      createArgs({
        session: sessionWithoutOptionalFields,
      })
    );

    expect(result.signature.slice(1, 6)).toEqual([
      SESSION_EXPIRES_AT,
      POLICY_ROOT,
      ZERO_FELT,
      FALLBACK_SESSION_KEY_GUID,
      ZERO_FELT,
    ]);
  });

  it("rejects invalid outside execution windows", () => {
    expect(() =>
      buildSignedOutsideExecutionV3(
        createArgs({
          details: {
            feeMode: { mode: "sponsored" },
            timeBounds: {
              executeAfter: 240,
              executeBefore: 240,
            },
          },
        })
      )
    ).toThrow(SessionProtocolError);
    expect(() =>
      buildSignedOutsideExecutionV3(
        createArgs({
          details: {
            feeMode: { mode: "sponsored" },
            timeBounds: {
              executeAfter: 240,
              executeBefore: 240,
            },
          },
        })
      )
    ).toThrow(
      "Outside execution window is invalid: execute_before must be greater than execute_after."
    );
  });

  it("rejects calls that are missing policy proofs", () => {
    const selector = normalizeFelt(
      hash.getSelectorFromName("ask_deep_thought")
    );

    expect(() =>
      buildSignedOutsideExecutionV3(
        createArgs({
          calls: [
            {
              contractAddress: "0x1",
              entrypoint: "ask_deep_thought",
              calldata: [],
            },
          ] as Call[],
          policyProofIndex: new Map(),
        })
      )
    ).toThrow(SessionProtocolError);
    expect(() =>
      buildSignedOutsideExecutionV3(
        createArgs({
          calls: [
            {
              contractAddress: "0x1",
              entrypoint: "ask_deep_thought",
              calldata: [],
            },
          ] as Call[],
          policyProofIndex: new Map(),
        })
      )
    ).toThrow(
      `Call is not authorized by session policies: ${normalizedAddress("0x1")}#${selector}`
    );
  });
});
