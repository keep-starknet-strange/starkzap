import type {
  Call,
  EstimateFeeResponseOverhead,
  PaymasterTimeBounds,
  Signature,
  TypedData,
} from "starknet";

export type CartridgePolicy = { target: string; method: string };

export interface CartridgeNativeConnectArgs {
  rpcUrl: string;
  chainId: string;
  policies?: CartridgePolicy[];
  preset?: string;
  url?: string;
  redirectUrl?: string;
  forceNewSession?: boolean;
}

export interface CartridgeNativeAccountLike {
  address: string;
  executePaymasterTransaction: (
    calls: Call[],
    details?: {
      feeMode: { mode: "sponsored" };
      timeBounds?: PaymasterTimeBounds;
    }
  ) => Promise<{ transaction_hash: string }>;
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
  connect(args: CartridgeNativeConnectArgs): Promise<CartridgeNativeSessionHandle>;
}

