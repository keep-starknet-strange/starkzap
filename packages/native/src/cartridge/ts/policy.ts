import { addAddressPadding } from "starknet";
import type { CartridgePolicy } from "@/cartridge/types";
import { SessionProtocolError } from "@/cartridge/ts/errors";

export interface CanonicalSessionPolicy {
  contractAddress: string;
  entrypoint: string;
}

export function canonicalizeSessionPolicies(
  policies: readonly CartridgePolicy[]
): CanonicalSessionPolicy[] {
  if (policies.length === 0) {
    throw new SessionProtocolError(
      "Session policies cannot be empty for Cartridge TS adapter."
    );
  }

  const normalized = policies.map((policy, index) => {
    const rawTarget = String(policy.target ?? "").trim();
    const rawMethod = String(policy.method ?? "").trim();

    if (!rawTarget) {
      throw new SessionProtocolError(
        `Policy at index ${index} is missing a target contract address.`
      );
    }
    if (!rawMethod) {
      throw new SessionProtocolError(
        `Policy at index ${index} is missing an entrypoint method.`
      );
    }

    let contractAddress = rawTarget.toLowerCase();
    try {
      contractAddress = addAddressPadding(contractAddress);
    } catch (error) {
      throw new SessionProtocolError(
        `Invalid policy target address at index ${index}: ${rawTarget}`,
        error
      );
    }

    return {
      contractAddress,
      entrypoint: rawMethod,
    };
  });

  return normalized.sort((a, b) => {
    const addressSort = a.contractAddress.localeCompare(b.contractAddress);
    if (addressSort !== 0) {
      return addressSort;
    }
    return a.entrypoint.localeCompare(b.entrypoint);
  });
}

export function policiesToSessionUrlShape(
  policies: readonly CanonicalSessionPolicy[]
): Array<{ target: string; method: string }> {
  return policies.map((policy) => ({
    target: policy.contractAddress,
    method: policy.entrypoint,
  }));
}
