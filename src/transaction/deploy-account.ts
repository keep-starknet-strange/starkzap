import { v3hash, CallData, EDAMode } from "starknet";
import type {
  SignableTransaction,
  DeployAccountTransactionDetails,
} from "./interface.js";

/**
 * Convert DA mode string to EDAMode.
 */
function toDAMode(mode: string): EDAMode {
  return mode === "L2" ? EDAMode.L2 : EDAMode.L1;
}

/**
 * Standard deploy account transaction for V3.
 *
 * Calculates the hash according to SNIP-12 / Starknet transaction spec.
 * Override this class to implement custom hash calculation for account abstraction.
 */
export class DeployAccountTransaction implements SignableTransaction {
  readonly type = "DEPLOY_ACCOUNT" as const;
  private readonly details: DeployAccountTransactionDetails;
  private cachedHash: string | null = null;

  constructor(details: Omit<DeployAccountTransactionDetails, "type">) {
    this.details = {
      ...details,
      type: "DEPLOY_ACCOUNT",
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
    const compiledCalldata = CallData.compile(d.constructorCalldata);

    this.cachedHash = v3hash.calculateDeployAccountTransactionHash(
      d.contractAddress,
      d.classHash,
      compiledCalldata,
      d.addressSalt,
      d.version,
      d.chainId as "0x534e5f4d41494e" | "0x534e5f5345504f4c4941",
      d.nonce,
      toDAMode(d.nonceDataAvailabilityMode),
      toDAMode(d.feeDataAvailabilityMode),
      d.resourceBounds,
      d.tip,
      d.paymasterData
    );

    return this.cachedHash;
  }

  getDetails(): DeployAccountTransactionDetails {
    return this.details;
  }
}
