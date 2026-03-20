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

export interface CartridgePolicyMethod {
  name?: string;
  description?: string;
  entrypoint: string;
  isEnabled?: boolean;
  isRequired?: boolean;
  isPaymastered?: boolean | CartridgePolicyPredicate;
  spender?: string;
  amount?: string | number | bigint;
  // Accept doc/config variants and normalize internally.
  is_enabled?: boolean;
  is_required?: boolean;
  is_paymastered?: boolean;
  predicate?: CartridgePolicyPredicate;
}

export interface CartridgeContractPolicy {
  name?: string;
  description?: string;
  methods: CartridgePolicyMethod[];
}

export interface CartridgeSessionPolicies {
  contracts?: Record<string, CartridgeContractPolicy>;
  messages?: Array<Record<string, unknown>>;
}

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
