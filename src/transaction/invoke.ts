import { v3hash, CallData, EDAMode, type Call } from "starknet";
import type {
  SignableTransaction,
  InvokeTransactionDetails,
} from "./interface.js";

/**
 * Convert DA mode string to EDAMode.
 */
function toDAMode(mode: string): EDAMode {
  return mode === "L2" ? EDAMode.L2 : EDAMode.L1;
}

/**
 * Standard invoke transaction for V3.
 *
 * Calculates the hash according to SNIP-12 / Starknet transaction spec.
 * Override this class to implement custom hash calculation for account abstraction.
 */
export class InvokeTransaction implements SignableTransaction {
  readonly type = "INVOKE" as const;
  private readonly details: InvokeTransactionDetails;
  private cachedHash: string | null = null;

  constructor(
    details: Omit<InvokeTransactionDetails, "type" | "calldata"> & {
      calls: Call[];
    }
  ) {
    this.details = {
      ...details,
      type: "INVOKE",
      calldata: CallData.toCalldata(details.calls),
    };
  }

  /**
   * Get the hash to sign.
   * Override this method for custom account validation logic.
   */
  getHashToSign(): string {
    if (this.cachedHash) {
      return this.cachedHash;
    }

    const d = this.details;
    this.cachedHash = v3hash.calculateInvokeTransactionHash(
      d.senderAddress,
      d.version,
      d.calldata,
      d.chainId as "0x534e5f4d41494e" | "0x534e5f5345504f4c4941",
      d.nonce,
      d.accountDeploymentData,
      toDAMode(d.nonceDataAvailabilityMode),
      toDAMode(d.feeDataAvailabilityMode),
      d.resourceBounds,
      d.tip,
      d.paymasterData
    );

    return this.cachedHash;
  }

  getDetails(): InvokeTransactionDetails {
    return this.details;
  }
}
