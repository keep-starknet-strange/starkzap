import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { deriveSessionSignerGuid } from "@/cartridge/ts/guid";
import { canonicalizeSessionPolicies } from "@/cartridge/ts/policy";
import { computePolicyMerkle } from "@/cartridge/ts/merkle";
import {
  buildCartridgeSessionUrl,
  extractEncodedSessionFromUrl,
  parseSessionFromEncodedRedirect,
} from "@/cartridge/ts/session_api";
import type { CartridgePolicy } from "@/cartridge/types";

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

  it("PAR-101 session URL includes required query payload", () => {
    const canonical = canonicalizeSessionPolicies([
      { target: "0xabc", method: "play_move" },
    ]);
    const url = buildCartridgeSessionUrl({
      baseUrl: "https://x.cartridge.gg",
      publicKey: "0x1234",
      policies: canonical,
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
    const canonical = canonicalizeSessionPolicies([
      { target: "0xabc", method: "play_move" },
    ]);
    const url = buildCartridgeSessionUrl({
      baseUrl: "https://x.cartridge.gg",
      publicKey: "0x1234",
      policies: canonical,
      rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
      preset: "tic-tac-toe",
      needsSessionCreation: true,
    });

    const parsed = new URL(url);
    expect(parsed.searchParams.get("preset")).toBe("tic-tac-toe");
    expect(parsed.searchParams.get("needs_session_creation")).toBe("true");
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
        "0x0982172dc42288d482abd0cd836c0d50f20b9f4717353acf9be577fabb228c8",
      ownerGuid: "0x123",
      expiresAt: "4702444800",
      guardianKeyGuid: "0x0",
      metadataHash: "0x0",
      sessionKeyGuid: "0x999",
      authorization: ["0xdead", "0x123"],
    });
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

  it("extracts encoded session from callback URLs", () => {
    const url = "tictactoe://cartridge/callback?startapp=abc123&other=value";
    expect(extractEncodedSessionFromUrl(url, "startapp")).toBe("abc123");
  });
});
