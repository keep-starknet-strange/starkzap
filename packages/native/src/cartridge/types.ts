import type {
  Call,
  EstimateFeeResponseOverhead,
  PaymasterTimeBounds,
  Signature,
  TypedData,
} from "starknet";

export interface CartridgePolicyPredicate {
  address: string;
  entrypoint: string;
}

/**
 * Normalized canonical session policy method shape (camelCase only).
 * Use {@link CartridgePolicyMethodInput} at boundaries where doc/config may use snake_case or `predicate` aliases.
 */
export interface CartridgePolicyMethod {
  name?: string;
  description?: string;
  entrypoint: string;
  isEnabled?: boolean;
  isRequired?: boolean;
  isPaymastered?: boolean | CartridgePolicyPredicate;
  spender?: string;
  amount?: string | number | bigint;
}

/**
 * Boundary/input shape for policy methods: extends the canonical fields with optional
 * snake_case and `predicate` compatibility aliases. Normalization merges these into
 * {@link CartridgePolicyMethod}; when both camelCase and snake_case are set, camelCase wins.
 */
export interface CartridgePolicyMethodInput extends CartridgePolicyMethod {
  is_enabled?: boolean;
  is_required?: boolean;
  is_paymastered?: boolean | CartridgePolicyPredicate;
  predicate?: CartridgePolicyPredicate;
}

/**
 * Session policy contract entry as received from connect args, presets, or JSON (boundary/input).
 */
export interface CartridgeContractPolicy {
  name?: string;
  description?: string;
  methods: CartridgePolicyMethodInput[];
}

/**
 * Session policy contract after normalization (canonical {@link CartridgePolicyMethod} entries only).
 */
export interface NormalizedCartridgeContractPolicy {
  name?: string;
  description?: string;
  methods: CartridgePolicyMethod[];
}

/**
 * Object-form session policies (`contracts` / optional `messages`). Boundary/input shape.
 */
export interface CartridgeSessionPolicies {
  contracts?: Record<string, CartridgeContractPolicy>;
  messages?: Array<Record<string, unknown>>;
}

/**
 * Object-form session policies after URL-shape normalization: contracts keyed by normalized
 * addresses with canonical method entries (no input-only aliases).
 */
export interface NormalizedCartridgeSessionPolicies {
  contracts: Record<string, NormalizedCartridgeContractPolicy>;
}

/**
 * Policies in the shape used for session URL encoding: array form is normalized {@link CartridgePolicy}
 * entries; object form uses {@link NormalizedCartridgeSessionPolicies}.
 */
export type NormalizedCartridgePolicies =
  | CartridgePolicy[]
  | NormalizedCartridgeSessionPolicies;

export interface CartridgePolicy {
  target: string;
  method: string;
  description?: string;
}

export type CartridgePolicies = CartridgePolicy[] | CartridgeSessionPolicies;

export interface CartridgeNativeConnectArgs {
  rpcUrl: string;
  chainId: string;
  /** Session policies. Required unless `preset` resolves policies for the active chain. */
  policies?: CartridgePolicies;
  preset?: string;
  shouldOverridePresetPolicies?: boolean;
  url?: string;
  redirectUrl?: string;
  forceNewSession?: boolean;
}

export interface CartridgeExecutionResult {
  transaction_hash: string;
  recovered_from_rpc_error?: true;
}

export interface CartridgeNativeAccountLike {
  address: string;
  execute: (
    calls: Call[],
    details?: {
      feeMode: { mode: "sponsored" };
      timeBounds?: PaymasterTimeBounds;
    }
  ) => Promise<CartridgeExecutionResult>;
  signMessage?: (typedData: TypedData) => Promise<Signature>;
  simulateTransaction?: (
    invocations: Array<{ type: "INVOKE"; payload: Call[] }>
  ) => Promise<unknown[]>;
  estimateInvokeFee?: (calls: Call[]) => Promise<EstimateFeeResponseOverhead>;
}

export interface CartridgeNativeSessionHandle {
  account: CartridgeNativeAccountLike;
  username?: () => Promise<string | undefined>;
  disconnect?: () => Promise<void>;
  controller?: unknown;
}

export interface CartridgeNativeAdapter {
  connect(
    args: CartridgeNativeConnectArgs
  ): Promise<CartridgeNativeSessionHandle>;
}
