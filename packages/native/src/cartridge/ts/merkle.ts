import { hash } from "starknet";
import type { CanonicalSessionPolicy } from "@/cartridge/ts/policy";
import { SessionProtocolError } from "@/cartridge/ts/errors";
import { normalizeFelt, selectorFromEntrypoint } from "@/cartridge/ts/shared";

export interface PolicyMerkleResult {
  leaves: string[];
  root: string;
}

export interface PolicyMerkleProof {
  contractAddress: string;
  selector: string;
  leaf: string;
  proof: string[];
}

// SNIP-12 type hash for policy leaves in the Cartridge session merkle tree.
const POLICY_CALL_TYPE_HASH = normalizeFelt(
  hash.getSelectorFromName(
    '"Allowed Method"("Contract Address":"ContractAddress","selector":"selector")'
  )
);

const ZERO_FELT = "0x0";

// Sorted pair hashing: always hash (smaller, larger) to produce a canonical
// merkle tree regardless of leaf insertion order.
function hashPair(left: string, right: string): string {
  const leftBigInt = BigInt(left);
  const rightBigInt = BigInt(right);
  if (leftBigInt <= rightBigInt) {
    return normalizeFelt(hash.computePoseidonHash(left, right));
  }
  return normalizeFelt(hash.computePoseidonHash(right, left));
}

function hashPolicyLeaf(policy: CanonicalSessionPolicy): string {
  const selector = selectorFromEntrypoint(policy.entrypoint);
  return normalizeFelt(
    hash.computePoseidonHashOnElements([
      POLICY_CALL_TYPE_HASH,
      policy.contractAddress,
      selector,
    ])
  );
}

function policySelector(policy: CanonicalSessionPolicy): string {
  return selectorFromEntrypoint(policy.entrypoint);
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
    if (currentLevel.length % 2 !== 0) {
      currentLevel.push(ZERO_FELT);
    }
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      if (!left) {
        throw new SessionProtocolError(
          "Unexpected empty merkle node while hashing policy tree."
        );
      }
      const right = currentLevel[i + 1] ?? ZERO_FELT;
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

export function computePolicyMerkleProofs(
  policies: readonly CanonicalSessionPolicy[]
): PolicyMerkleProof[] {
  if (policies.length === 0) {
    throw new SessionProtocolError(
      "Cannot compute policy merkle proofs for an empty policy set."
    );
  }

  const leaves = policies.map(hashPolicyLeaf);
  const proofs = leaves.map(() => [] as string[]);
  let currentLevel = leaves.slice();
  let currentIndices: number[][] = leaves.map((_, index) => [index]);

  while (currentLevel.length > 1) {
    const nextLevel: string[] = [];
    const nextIndices: number[][] = [];

    if (currentLevel.length % 2 !== 0) {
      currentLevel.push(ZERO_FELT);
      currentIndices.push([]);
    }

    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      if (!left) {
        throw new SessionProtocolError(
          "Unexpected empty merkle node while building policy proofs."
        );
      }
      const right = currentLevel[i + 1] ?? ZERO_FELT;
      const leftIndices = currentIndices[i] ?? [];
      const rightIndices = currentIndices[i + 1] ?? [];

      for (const index of leftIndices) {
        proofs[index]?.push(right);
      }
      for (const index of rightIndices) {
        proofs[index]?.push(left);
      }

      nextLevel.push(hashPair(left, right));
      nextIndices.push([...leftIndices, ...rightIndices]);
    }

    currentLevel = nextLevel;
    currentIndices = nextIndices;
  }

  return policies.map((policy, index) => ({
    contractAddress: policy.contractAddress,
    selector: policySelector(policy),
    leaf: leaves[index] ?? "0x0",
    proof: proofs[index] ?? [],
  }));
}
