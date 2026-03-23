import type {
  CartridgeContractPolicy,
  CartridgePolicies,
  CartridgePolicy,
  CartridgePolicyMethod,
  CartridgePolicyMethodInput,
  CartridgePolicyPredicate,
  CartridgeSessionPolicies,
  NormalizedCartridgeContractPolicy,
  NormalizedCartridgePolicies,
  NormalizedCartridgeSessionPolicies,
} from "@/cartridge/types";
import { SessionProtocolError } from "@/cartridge/ts/errors";
import { asRecord, normalizeContractAddress } from "@/cartridge/ts/shared";

export interface CanonicalSessionPolicy {
  contractAddress: string;
  entrypoint: string;
}

function asciiLowerCodeAt(value: string, index: number): number {
  const code = value.charCodeAt(index);
  if (code >= 65 && code <= 90) {
    return code + 32;
  }
  return code;
}

function compareAsciiCaseInsensitive(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  for (let index = 0; index < limit; index += 1) {
    const left = asciiLowerCodeAt(a, index);
    const right = asciiLowerCodeAt(b, index);
    if (left < right) {
      return -1;
    }
    if (left > right) {
      return 1;
    }
  }

  if (a.length < b.length) {
    return -1;
  }
  if (a.length > b.length) {
    return 1;
  }
  return 0;
}

function compareLexically(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  for (let index = 0; index < limit; index += 1) {
    const left = a.charCodeAt(index);
    const right = b.charCodeAt(index);
    if (left < right) {
      return -1;
    }
    if (left > right) {
      return 1;
    }
  }

  if (a.length < b.length) {
    return -1;
  }
  if (a.length > b.length) {
    return 1;
  }
  return 0;
}

function compareControllerCanonicalPolicy(
  a: CanonicalSessionPolicy,
  b: CanonicalSessionPolicy
): number {
  // Mirror Cartridge controller (cartridge-gg/controller) policy ordering:
  // address lexicographic, then ASCII-case-insensitive entrypoint, then exact entrypoint tiebreak.
  const addressSort = compareLexically(a.contractAddress, b.contractAddress);
  if (addressSort !== 0) {
    return addressSort;
  }

  const entrypointSort = compareAsciiCaseInsensitive(
    a.entrypoint,
    b.entrypoint
  );
  if (entrypointSort !== 0) {
    return entrypointSort;
  }

  return compareLexically(a.entrypoint, b.entrypoint);
}

function hasMessages(policies: CartridgeSessionPolicies): boolean {
  return Array.isArray(policies.messages) && policies.messages.length > 0;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function normalizePredicate(
  value: unknown,
  context: string
): CartridgePolicyPredicate {
  const record = asRecord(value);
  const rawAddress = typeof record?.address === "string" ? record.address : "";
  const rawEntrypoint =
    typeof record?.entrypoint === "string" ? record.entrypoint.trim() : "";

  if (!rawAddress || !rawEntrypoint) {
    throw new SessionProtocolError(
      `${context} predicate must include both address and entrypoint.`
    );
  }

  return {
    address: normalizeContractAddress(rawAddress, `${context} predicate`),
    entrypoint: rawEntrypoint,
  };
}

function normalizeMethodForUrl(
  method: CartridgePolicyMethodInput,
  context: string
): CartridgePolicyMethod {
  const entrypoint = normalizeOptionalString(method.entrypoint);
  if (!entrypoint) {
    throw new SessionProtocolError(`${context} is missing an entrypoint.`);
  }

  const normalized: CartridgePolicyMethod = { entrypoint };
  const name = normalizeOptionalString(method.name);
  if (name) {
    normalized.name = name;
  }
  const description = normalizeOptionalString(method.description);
  if (description) {
    normalized.description = description;
  }

  const isEnabled = normalizeOptionalBoolean(
    method.isEnabled ?? method.is_enabled
  );
  if (isEnabled !== undefined) {
    normalized.isEnabled = isEnabled;
  }

  const isRequired = normalizeOptionalBoolean(
    method.isRequired ?? method.is_required
  );
  if (isRequired !== undefined) {
    normalized.isRequired = isRequired;
  }

  const rawIsPaymastered = method.isPaymastered ?? method.is_paymastered;
  const rawPredicate =
    method.predicate ??
    (typeof rawIsPaymastered === "object" && rawIsPaymastered
      ? rawIsPaymastered
      : undefined);

  if (typeof rawIsPaymastered === "boolean") {
    normalized.isPaymastered = rawIsPaymastered;
  }
  if (rawPredicate !== undefined) {
    if (rawIsPaymastered === false) {
      throw new SessionProtocolError(
        `${context} cannot define a predicate when isPaymastered is false.`
      );
    }
    normalized.isPaymastered = normalizePredicate(rawPredicate, context);
  }

  const spender = normalizeOptionalString(method.spender);
  if (spender) {
    normalized.spender = normalizeContractAddress(
      spender,
      `${context} spender`
    );
  }
  if (method.amount !== undefined && method.amount !== null) {
    normalized.amount =
      typeof method.amount === "bigint" ? String(method.amount) : method.amount;
  }

  return normalized;
}

function canonicalPoliciesFromArray(
  policies: readonly CartridgePolicy[]
): CanonicalSessionPolicy[] {
  if (policies.length === 0) {
    throw new SessionProtocolError(
      "Session policies cannot be empty for Cartridge TS adapter."
    );
  }

  return policies.map((policy, index) => {
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

    return {
      contractAddress: normalizeContractAddress(
        rawTarget,
        `Policy at index ${index}`
      ),
      entrypoint: rawMethod,
    };
  });
}

function canonicalPoliciesFromSessionPolicies(
  policies: CartridgeSessionPolicies
): CanonicalSessionPolicy[] {
  if (hasMessages(policies)) {
    throw new SessionProtocolError(
      "Typed-data message policies are not yet supported by the Cartridge TS adapter."
    );
  }

  const contracts = policies.contracts ?? {};
  const canonical: CanonicalSessionPolicy[] = [];

  for (const [rawAddress, contract] of Object.entries(contracts)) {
    const contractAddress = normalizeContractAddress(
      rawAddress,
      "Session policy contract"
    );
    const methods = Array.isArray(contract.methods) ? contract.methods : [];

    methods.forEach((method, index) => {
      const normalizedMethod = normalizeMethodForUrl(
        method,
        `Policy ${contractAddress}#${index}`
      );

      if (
        normalizedMethod.entrypoint === "approve" &&
        (normalizedMethod.spender !== undefined ||
          normalizedMethod.amount !== undefined)
      ) {
        throw new SessionProtocolError(
          "Approval policies with spender/amount are not yet supported by the Cartridge TS adapter merkle implementation."
        );
      }

      canonical.push({
        contractAddress,
        entrypoint: normalizedMethod.entrypoint,
      });
    });
  }

  if (canonical.length === 0) {
    throw new SessionProtocolError(
      "Session policies cannot be empty for Cartridge TS adapter."
    );
  }

  return canonical;
}

export function hasPoliciesInput(
  policies: CartridgePolicies | undefined
): boolean {
  if (!policies) {
    return false;
  }
  if (Array.isArray(policies)) {
    return policies.length > 0;
  }
  return Boolean(
    (policies.contracts && Object.keys(policies.contracts).length > 0) ||
    (policies.messages && policies.messages.length > 0)
  );
}

export function canonicalizeSessionPolicies(
  policies: CartridgePolicies
): CanonicalSessionPolicy[] {
  const normalized = Array.isArray(policies)
    ? canonicalPoliciesFromArray(policies)
    : canonicalPoliciesFromSessionPolicies(policies);

  return normalized.sort(compareControllerCanonicalPolicy);
}

function normalizeContractPolicyForUrl(
  contract: CartridgeContractPolicy,
  contractAddress: string
): NormalizedCartridgeContractPolicy {
  const methods = contract.methods;
  if (methods !== undefined && methods !== null && !Array.isArray(methods)) {
    throw new SessionProtocolError("Policy contract.methods must be an array.");
  }

  const normalizedContract: NormalizedCartridgeContractPolicy = {
    methods: (methods ?? []).map((method, index) =>
      normalizeMethodForUrl(method, `Policy ${contractAddress}#${index}`)
    ),
  };
  const name = normalizeOptionalString(contract.name);
  if (name) {
    normalizedContract.name = name;
  }
  const description = normalizeOptionalString(contract.description);
  if (description) {
    normalizedContract.description = description;
  }
  return normalizedContract;
}

export function policiesToSessionUrlShape(
  policies: CartridgePolicy[]
): CartridgePolicy[];
export function policiesToSessionUrlShape(
  policies: CartridgeSessionPolicies
): NormalizedCartridgeSessionPolicies;
export function policiesToSessionUrlShape(
  policies: CartridgePolicies
): NormalizedCartridgePolicies;
export function policiesToSessionUrlShape(
  policies: CartridgePolicies
): NormalizedCartridgePolicies {
  if (Array.isArray(policies)) {
    return policies.map((policy, index) => {
      const target = normalizeContractAddress(
        String(policy.target ?? ""),
        `Policy at index ${index}`
      );
      const method = String(policy.method ?? "").trim();
      if (!method) {
        throw new SessionProtocolError(
          `Policy at index ${index} is missing an entrypoint method.`
        );
      }

      const normalizedPolicy: CartridgePolicy = {
        target,
        method,
      };
      const description = normalizeOptionalString(policy.description);
      if (description) {
        normalizedPolicy.description = description;
      }

      return normalizedPolicy;
    });
  }

  if (hasMessages(policies)) {
    throw new SessionProtocolError(
      "Typed-data message policies are not yet supported by the Cartridge TS adapter."
    );
  }

  const normalizedContracts = Object.fromEntries(
    Object.entries(policies.contracts ?? {}).map(([rawAddress, contract]) => {
      const contractAddress = normalizeContractAddress(
        rawAddress,
        "Session policy contract"
      );

      return [
        contractAddress,
        normalizeContractPolicyForUrl(contract, contractAddress),
      ];
    })
  );

  return {
    contracts: normalizedContracts,
  };
}
