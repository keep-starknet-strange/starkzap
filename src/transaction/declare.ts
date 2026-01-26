import { v3hash, EDAMode } from "starknet";
import type {
  SignableTransaction,
  DeclareTransactionDetails,
} from "./interface.js";

/**
 * Convert DA mode string to EDAMode.
 */
function toDAMode(mode: string): EDAMode {
  return mode === "L2" ? EDAMode.L2 : EDAMode.L1;
}

/**
 * Standard declare transaction for V3.
 *
 * Calculates the hash according to SNIP-12 / Starknet transaction spec.
 * Override this class to implement custom hash calculation for account abstraction.
 */
export class DeclareTransaction implements SignableTransaction {
  readonly type = "DECLARE" as const;
  private readonly details: DeclareTransactionDetails;
  private cachedHash: string | null = null;

  constructor(details: Omit<DeclareTransactionDetails, "type">) {
    this.details = {
      ...details,
      type: "DECLARE",
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

    this.cachedHash = v3hash.calculateDeclareTransactionHash(
      d.classHash,
      d.compiledClassHash,
      d.senderAddress,
      d.version,
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

  getDetails(): DeclareTransactionDetails {
    return this.details;
  }
}
