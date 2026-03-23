import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { hash, num } from "starknet";
import { deriveSessionSignerGuid } from "@/cartridge/ts/guid";
import { canonicalizeSessionPolicies } from "@/cartridge/ts/policy";
import {
  computePolicyMerkle,
  computePolicyMerkleProofs,
} from "@/cartridge/ts/merkle";
import { SessionProtocolError } from "@/cartridge/ts/errors";
import {
  buildCartridgeSessionUrl,
  extractEncodedSessionFromUrl,
  parseSessionFromEncodedRedirect,
} from "@/cartridge/ts/session_api";
import type {
  CartridgePolicies,
  CartridgePolicy,
  CartridgeSessionPolicies,
} from "@/cartridge/types";

type FixtureFile = {
  guidVectors: Array<{
    privateKey: string;
    expectedGuid: string;
  }>;
  policyVectors: Array<{
    name: string;
    input: CartridgePolicy[];
    expectedCanonical: Array<{
      contractAddress: string;
      entrypoint: string;
    }>;
    expectedMerkleRoot: string;
  }>;
  sessionVectors: Array<{
    name: string;
    encodedSession: string;
    expected: {
      username: string;
      address: string;
      ownerGuid: string;
      expiresAt: string;
      guardianKeyGuid: string;
      metadataHash: string;
      sessionKeyGuid: string;
    };
  }>;
};

function loadFixture(): FixtureFile {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const fixturePath = path.resolve(
    currentDir,
    "fixtures/v1.session-parity.json"
  );
  return JSON.parse(fs.readFileSync(fixturePath, "utf8")) as FixtureFile;
}

function normalizeFelt(value: string): string {
  return num.toHex(value).toLowerCase();
}

function hashPair(left: string, right: string): string {
  const leftBigInt = BigInt(left);
  const rightBigInt = BigInt(right);
  if (leftBigInt <= rightBigInt) {
    return normalizeFelt(hash.computePoseidonHash(left, right));
  }
  return normalizeFelt(hash.computePoseidonHash(right, left));
}

function computeRootFromProof(leaf: string, proof: readonly string[]): string {
  return proof.reduce((current, sibling) => hashPair(current, sibling), leaf);
}

describe("cartridge ts parity fixtures", () => {
  const fixture = loadFixture();

  it("PAR-001 GUID derivation matches fixture vectors", () => {
    for (const vector of fixture.guidVectors) {
      expect(deriveSessionSignerGuid(vector.privateKey)).toBe(
        vector.expectedGuid
      );
    }
  });

  it("PAR-002 and PAR-003 policy canonicalization and merkle root match fixture vectors", () => {
    for (const vector of fixture.policyVectors) {
      const canonical = canonicalizeSessionPolicies(vector.input);
      expect(canonical).toEqual(vector.expectedCanonical);
      expect(computePolicyMerkle(canonical).root).toBe(
        vector.expectedMerkleRoot
      );
    }
  });

  it("PAR-005 malformed policy entries map to deterministic errors", () => {
    expect(() =>
      canonicalizeSessionPolicies([{ target: "0x1", method: "" }])
    ).toThrow("missing an entrypoint method");
  });

  it("PAR-006 canonical policy ordering matches controller.c for mixed-case entrypoints", () => {
    const canonical = canonicalizeSessionPolicies([
      { target: "0x1", method: "approve" },
      { target: "0x01", method: "Approve" },
      { target: "0x001", method: "0xabc" },
      { target: "0x0001", method: "0xABC" },
    ]);

    expect(canonical).toEqual([
      {
        contractAddress:
          "0x0000000000000000000000000000000000000000000000000000000000000001",
        entrypoint: "0xABC",
      },
      {
        contractAddress:
          "0x0000000000000000000000000000000000000000000000000000000000000001",
        entrypoint: "0xabc",
      },
      {
        contractAddress:
          "0x0000000000000000000000000000000000000000000000000000000000000001",
        entrypoint: "Approve",
      },
      {
        contractAddress:
          "0x0000000000000000000000000000000000000000000000000000000000000001",
        entrypoint: "approve",
      },
    ]);
  });

  it("PAR-007 policy proofs reconstruct the root for every leaf in a 3-policy tree", () => {
    const canonical = canonicalizeSessionPolicies([
      { target: "0x1", method: "approve" },
      { target: "0x2", method: "transfer" },
      { target: "0x3", method: "mint" },
    ]);

    const { root } = computePolicyMerkle(canonical);
    const proofs = computePolicyMerkleProofs(canonical);

    expect(proofs).toHaveLength(3);
    for (const proof of proofs) {
      expect(proof.proof).toHaveLength(2);
      expect(computeRootFromProof(proof.leaf, proof.proof)).toBe(root);
    }
  });

  it("PAR-008 policy proofs reconstruct the root for every leaf in a 4-policy tree", () => {
    const canonical = canonicalizeSessionPolicies([
      { target: "0x1", method: "approve" },
      { target: "0x2", method: "transfer" },
      { target: "0x3", method: "mint" },
      { target: "0x4", method: "burn" },
    ]);

    const { root } = computePolicyMerkle(canonical);
    const proofs = computePolicyMerkleProofs(canonical);

    expect(proofs).toHaveLength(4);
    for (const proof of proofs) {
      expect(proof.proof).toHaveLength(2);
      expect(computeRootFromProof(proof.leaf, proof.proof)).toBe(root);
    }
  });

  it("PAR-009 canonicalizes CartridgeSessionPolicies object-form input", () => {
    const objectPolicies: CartridgeSessionPolicies = {
      contracts: {
        "0x1": {
          methods: [{ entrypoint: "approve" }, { entrypoint: "transfer" }],
        },
        "0x2": {
          methods: [{ entrypoint: "mint" }],
        },
      },
    };

    const canonical = canonicalizeSessionPolicies(objectPolicies);

    expect(canonical.length).toBe(3);
    expect(canonical.every((p) => p.contractAddress && p.entrypoint)).toBe(
      true
    );
    // Should be sorted by address then entrypoint
    const addresses = canonical.map((p) => p.contractAddress);
    expect(addresses).toEqual([...addresses].sort());
  });

  it("PAR-010 rejects typed-data message policies in object-form input", () => {
    const messagePolicies: CartridgeSessionPolicies = {
      contracts: {
        "0x1": {
          methods: [{ entrypoint: "transfer" }],
        },
      },
      messages: [{ key: "value" }],
    };

    expect(() => canonicalizeSessionPolicies(messagePolicies)).toThrow(
      SessionProtocolError
    );
    expect(() => canonicalizeSessionPolicies(messagePolicies)).toThrow(
      "message policies are not yet supported"
    );
  });

  it("PAR-011 rejects empty contracts map in object-form input", () => {
    const emptyPolicies: CartridgeSessionPolicies = {
      contracts: {},
    };

    expect(() => canonicalizeSessionPolicies(emptyPolicies)).toThrow(
      SessionProtocolError
    );
    expect(() => canonicalizeSessionPolicies(emptyPolicies)).toThrow(
      "cannot be empty"
    );
  });

  it("PAR-012 rejects approve policies with spender/amount in object-form input", () => {
    const approveWithSpender: CartridgeSessionPolicies = {
      contracts: {
        "0x1": {
          methods: [{ entrypoint: "approve", spender: "0x2", amount: "100" }],
        },
      },
    };

    expect(() => canonicalizeSessionPolicies(approveWithSpender)).toThrow(
      SessionProtocolError
    );
    expect(() => canonicalizeSessionPolicies(approveWithSpender)).toThrow(
      "spender/amount are not yet supported"
    );
  });

  it("PAR-013 object-form policies produce the same merkle root as equivalent array-form", () => {
    const arrayPolicies: CartridgePolicy[] = [
      { target: "0x1", method: "approve" },
      { target: "0x1", method: "transfer" },
    ];

    const objectPolicies: CartridgeSessionPolicies = {
      contracts: {
        "0x1": {
          methods: [{ entrypoint: "approve" }, { entrypoint: "transfer" }],
        },
      },
    };

    const arrayCanonical = canonicalizeSessionPolicies(arrayPolicies);
    const objectCanonical = canonicalizeSessionPolicies(objectPolicies);

    expect(computePolicyMerkle(arrayCanonical).root).toBe(
      computePolicyMerkle(objectCanonical).root
    );
  });

  it("PAR-101 session URL includes required query payload", () => {
    const policies: CartridgePolicy[] = [
      { target: "0xabc", method: "play_move" },
    ];
    const url = buildCartridgeSessionUrl({
      baseUrl: "https://x.cartridge.gg",
      publicKey: "0x1234",
      policies,
      rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
      redirectUrl: "tictactoe://cartridge/callback",
      redirectQueryName: "startapp",
    });

    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/session");
    expect(parsed.searchParams.get("public_key")).toBe("0x1234");
    expect(parsed.searchParams.get("rpc_url")).toBe(
      "https://api.cartridge.gg/x/starknet/sepolia"
    );
    expect(parsed.searchParams.get("policies")).toContain("play_move");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "tictactoe://cartridge/callback"
    );
    expect(parsed.searchParams.get("redirect_query_name")).toBe("startapp");
    expect(parsed.searchParams.get("preset")).toBeNull();
    expect(parsed.searchParams.get("needs_session_creation")).toBeNull();
  });

  it("PAR-101b session URL includes preset and force-new-session when provided", () => {
    const policies: CartridgePolicy[] = [
      { target: "0xabc", method: "play_move" },
    ];
    const url = buildCartridgeSessionUrl({
      baseUrl: "https://x.cartridge.gg",
      publicKey: "0x1234",
      policies,
      rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
      preset: "tic-tac-toe",
      needsSessionCreation: true,
    });

    const parsed = new URL(url);
    expect(parsed.searchParams.get("preset")).toBe("tic-tac-toe");
    expect(parsed.searchParams.get("needs_session_creation")).toBe("true");
  });

  it("PAR-101c session URL rejects non-http base URLs", () => {
    expect(() =>
      buildCartridgeSessionUrl({
        baseUrl: "ftp://x.cartridge.gg",
        publicKey: "0x1234",
        policies: [{ target: "0xabc", method: "play_move" }],
        rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
      })
    ).toThrow("baseUrl must use http:// or https://");
  });

  it("PAR-101a empty policies and no preset throws protocol error", () => {
    expect(() =>
      buildCartridgeSessionUrl({
        baseUrl: "https://x.cartridge.gg",
        publicKey: "0x1234",
        policies: [],
        rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
      })
    ).toThrow("Cartridge session URL requires either policies or a preset.");
    expect(() =>
      buildCartridgeSessionUrl({
        baseUrl: "https://x.cartridge.gg",
        publicKey: "0x1234",
        policies: { contracts: {} },
        rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
      })
    ).toThrow("Cartridge session URL requires either policies or a preset.");
  });

  it("PAR-101d malformed contract methods payloads fail with a protocol error", () => {
    const malformedPolicies = {
      contracts: {
        "0xabc": {
          methods: "create_game",
        },
      },
    } as unknown as CartridgePolicies;

    expect(() =>
      buildCartridgeSessionUrl({
        baseUrl: "https://x.cartridge.gg",
        publicKey: "0x1234",
        policies: malformedPolicies,
        rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
      })
    ).toThrow(SessionProtocolError);
    expect(() =>
      buildCartridgeSessionUrl({
        baseUrl: "https://x.cartridge.gg",
        publicKey: "0x1234",
        policies: malformedPolicies,
        rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
      })
    ).toThrow("Policy contract.methods must be an array.");
  });

  it("PAR-102 redirect payload parsing matches fixture vectors", () => {
    for (const vector of fixture.sessionVectors) {
      expect(parseSessionFromEncodedRedirect(vector.encodedSession)).toEqual(
        vector.expected
      );
    }
  });

  it("PAR-102b redirect parsing supports controller/authorization payload shape", () => {
    const payload = {
      controller: {
        address: "0xabc",
        accountID: "player1",
      },
      authorization: ["0xdead", "0x123"],
      expiresAt: "4702444800",
      metadataHash: "0x0",
      guardianKeyGuid: "0x0",
      sessionKeyGuid: "0x999",
      isRevoked: false,
      appID: "app-1",
      chainID: "SN_SEPOLIA",
    };
    const encoded = encodeURIComponent(
      Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
    );

    expect(parseSessionFromEncodedRedirect(encoded)).toEqual({
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

  it("PAR-102d redirect parsing prefers top-level identity over controller identity", () => {
    const payload = {
      username: "legacy-user",
      address:
        "0x0982172dc42288d482abd0cd836c0d50f20b9f4717353acf9be577fabb228c8",
      controller: {
        address: "0xabc",
        accountID: "player1",
      },
      authorization: ["0xdead", "0x123"],
      expiresAt: "4702444800",
      sessionKeyGuid: "0x999",
    };
    const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
      "base64url"
    );

    expect(parseSessionFromEncodedRedirect(encoded)).toEqual({
      username: "legacy-user",
      address:
        "0x00982172dc42288d482abd0cd836c0d50f20b9f4717353acf9be577fabb228c8",
      ownerGuid: "0x123",
      expiresAt: "4702444800",
      guardianKeyGuid: "0x0",
      metadataHash: "0x0",
      sessionKeyGuid: "0x999",
      authorization: ["0xdead", "0x123"],
    });
  });

  it("PAR-102e malformed redirect base64 fails with a protocol error", () => {
    const decodeError = new SyntaxError("Invalid base64 payload.");
    vi.stubGlobal("atob", () => {
      throw decodeError;
    });

    try {
      let thrown: unknown;
      try {
        parseSessionFromEncodedRedirect("%%%");
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(SessionProtocolError);
      expect((thrown as Error).message).toBe(
        "Cartridge session redirect payload is not valid base64."
      );
      expect((thrown as Error & { cause?: unknown }).cause).toBe(decodeError);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("PAR-102c redirect parsing accepts missing session key guid when default is provided", () => {
    const payload = {
      username: "player1",
      address: "0xabc",
      ownerGuid: "0x123",
      expiresAt: "4702444800",
    };
    const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
      "base64url"
    );

    expect(
      parseSessionFromEncodedRedirect(encoded, {
        defaultSessionKeyGuid: "0x999",
      })
    ).toEqual({
      username: "player1",
      address:
        "0x0000000000000000000000000000000000000000000000000000000000000abc",
      ownerGuid: "0x123",
      expiresAt: "4702444800",
      guardianKeyGuid: "0x0",
      metadataHash: "0x0",
      sessionKeyGuid: "0x999",
    });
  });

  it("PAR-102f alias-only legacy redirect payloads are rejected", () => {
    const payload = {
      accountId: "player1",
      accountAddress: "0xabc",
      owner_guid: "0x123",
      expires_at: "4702444800",
      session_key_guid: "0x999",
    };
    const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
      "base64url"
    );

    expect(() => parseSessionFromEncodedRedirect(encoded)).toThrow(
      SessionProtocolError
    );
    expect(() => parseSessionFromEncodedRedirect(encoded)).toThrow(
      "Malformed Cartridge session payload; missing required fields: username, address, ownerGuid, expiresAt, sessionKeyGuid."
    );
  });

  it("PAR-102g alias-only controller redirect payloads are rejected", () => {
    const payload = {
      controller: {
        address: "0xabc",
        accountId: "player1",
      },
      authorization: ["0xdead", "0x123"],
      expiresAt: "4702444800",
      sessionKeyGuid: "0x999",
    };
    const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
      "base64url"
    );

    expect(() => parseSessionFromEncodedRedirect(encoded)).toThrow(
      SessionProtocolError
    );
    expect(() => parseSessionFromEncodedRedirect(encoded)).toThrow(
      "Malformed Cartridge session payload; missing required fields: username."
    );
  });

  it("extracts encoded session from callback URLs", () => {
    const url = "tictactoe://cartridge/callback?startapp=abc123&other=value";
    expect(extractEncodedSessionFromUrl(url, "startapp")).toBe("abc123");
  });
});
