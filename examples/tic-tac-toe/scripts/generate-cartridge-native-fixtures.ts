#!/usr/bin/env tsx

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as native from "@starkzap/native";

const OUTPUT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/native/tests/cartridge/fixtures/v1.session-parity.generated.json"
);

const canonicalizeSessionPolicies = (
  native as { canonicalizeSessionPolicies?: (input: unknown[]) => unknown[] }
).canonicalizeSessionPolicies;
const computePolicyMerkle = (
  native as { computePolicyMerkle?: (policies: unknown[]) => { root: string } }
).computePolicyMerkle;
const deriveSessionSignerGuid = (
  native as { deriveSessionSignerGuid?: (privateKey: string) => string }
).deriveSessionSignerGuid;

if (
  typeof canonicalizeSessionPolicies !== "function" ||
  typeof computePolicyMerkle !== "function" ||
  typeof deriveSessionSignerGuid !== "function"
) {
  throw new Error(
    "Missing TS adapter parity exports from @starkzap/native. Build @starkzap/native before running this script."
  );
}

const vectors = {
  version: "controller-ts-v1",
  generatedAt: new Date().toISOString(),
  guidVectors: ["0x1", "0x1234", "0xabcde"].map((privateKey) => ({
    privateKey,
    expectedGuid: deriveSessionSignerGuid(privateKey),
  })),
  policyVectors: [
    {
      name: "three-policies-unsorted",
      input: [
        { target: "0xabc", method: "play_move" },
        { target: "0x1", method: "create_game" },
        { target: "0xabc", method: "create_game" },
      ],
    },
  ].map((vector) => {
    const canonical = canonicalizeSessionPolicies(vector.input);
    return {
      ...vector,
      expectedCanonical: canonical,
      expectedMerkleRoot: computePolicyMerkle(canonical).root,
    };
  }),
};

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(vectors, null, 2)}\n`, "utf8");
console.log(`Wrote fixture file: ${OUTPUT_PATH}`);
