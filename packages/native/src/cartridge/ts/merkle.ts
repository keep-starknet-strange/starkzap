import { hash, num } from "starknet";
import type { CanonicalSessionPolicy } from "@/cartridge/ts/policy";
import { SessionProtocolError } from "@/cartridge/ts/errors";

export interface PolicyMerkleResult {
  leaves: string[];
  root: string;
}

function normalizeFelt(value: string): string {
  return num.toHex(value).toLowerCase();
}

function hashPair(left: string, right: string): string {
  return normalizeFelt(hash.computePoseidonHash(left, right));
}

function hashPolicyLeaf(policy: CanonicalSessionPolicy): string {
  const selector = hash.getSelectorFromName(policy.entrypoint);
  return normalizeFelt(
    hash.computePoseidonHashOnElements([policy.contractAddress, selector])
  );
}

export function computePolicyMerkle(
  policies: readonly CanonicalSessionPolicy[]
): PolicyMerkleResult {
  if (policies.length === 0) {
    throw new SessionProtocolError(
      "Cannot compute policy merkle root for an empty policy set."
    );
  }

  const leaves = policies.map(hashPolicyLeaf);
  let currentLevel = leaves.slice();

  while (currentLevel.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      if (!left) {
        throw new SessionProtocolError(
          "Unexpected empty merkle node while hashing policy tree."
        );
      }
      const right = currentLevel[i + 1] ?? left;
      nextLevel.push(hashPair(left, right));
    }
    currentLevel = nextLevel;
  }

  const root = currentLevel[0];
  if (!root) {
    throw new SessionProtocolError("Failed to derive a policy merkle root.");
  }

  return {
    leaves,
    root,
  };
}
