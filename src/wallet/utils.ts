import {
  RpcProvider,
  RpcError,
  TransactionFinalityStatus,
  type Call,
  type PaymasterTimeBounds,
} from "starknet";
import type { PAYMASTER_API } from "@starknet-io/starknet-types-010";
import { Tx } from "@/tx";
import { isRecord } from "@/utils/ekubo";
import type { Address } from "@/types";
import type {
  DeployOptions,
  EnsureReadyOptions,
  FeeMode,
  PreflightOptions,
  PreflightResult,
} from "@/types";

/** Canonical (non-deprecated) fee mode variants. */
export type NormalizedFeeMode =
  | "user_pays"
  | { type: "paymaster"; gasToken?: Address };

/**
 * Normalize FeeMode by converting the deprecated `"sponsored"` alias
 * to its canonical `{ type: "paymaster" }` form.
 */
export function normalizeFeeMode(feeMode: FeeMode): NormalizedFeeMode {
  if (feeMode === "sponsored") return { type: "paymaster" };
  return feeMode;
}

/** Type guard: does this fee mode use the paymaster path? */
export function isPaymasterMode(
  feeMode: FeeMode | undefined
): feeMode is { type: "paymaster"; gasToken?: Address } | "sponsored" {
  return (
    feeMode === "sponsored" ||
    (typeof feeMode === "object" &&
      feeMode !== null &&
      feeMode.type === "paymaster")
  );
}

/**
 * Shared wallet utilities.
 * Used by wallet implementations to avoid code duplication.
 */

/**
 * Check if an account is deployed on-chain.
 */
export async function checkDeployed(
  provider: RpcProvider,
  address: Address
): Promise<boolean> {
  try {
    const classHash = await provider.getClassHashAt(address);
    return !!classHash;
  } catch (error) {
    // Undeployed accounts are expected to throw "contract not found".
    // Other RPC failures should propagate so callers can distinguish
    // connectivity/runtime issues from undeployed state.
    if (isContractNotFound(error)) {
      return false;
    }
    throw error;
  }
}

function isContractNotFound(error: unknown): boolean {
  if (error instanceof RpcError) {
    return error.isType("CONTRACT_NOT_FOUND");
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("contract not found") ||
      message.includes("contract_not_found")
    );
  }

  return false;
}

/**
 * Ensure a wallet is ready for transactions.
 */
export async function ensureWalletReady(
  wallet: {
    isDeployed: () => Promise<boolean>;
    deploy: (options?: DeployOptions) => Promise<Tx>;
  },
  options: EnsureReadyOptions = {}
): Promise<void> {
  const { deploy = "if_needed", feeMode, onProgress } = options;

  try {
    onProgress?.({ step: "CONNECTED" });

    onProgress?.({ step: "CHECK_DEPLOYED" });
    const deployed = await wallet.isDeployed();

    if (deployed) {
      onProgress?.({ step: "READY" });
      return;
    }

    if (deploy === "never") {
      throw new Error("Account not deployed and deploy mode is 'never'");
    }

    onProgress?.({ step: "DEPLOYING" });
    const deployOpts: DeployOptions = {
      ...(feeMode && { feeMode }),
    };
    const tx = await wallet.deploy(
      Object.keys(deployOpts).length > 0 ? deployOpts : undefined
    );
    await tx.wait({
      successStates: [
        TransactionFinalityStatus.ACCEPTED_ON_L2,
        TransactionFinalityStatus.ACCEPTED_ON_L1,
      ],
    });

    onProgress?.({ step: "READY" });
  } catch (error) {
    onProgress?.({ step: "FAILED" });
    throw error;
  }
}

/**
 * Simulate a transaction to check if it would succeed.
 */
export async function preflightTransaction(
  wallet: {
    isDeployed: () => Promise<boolean>;
  },
  account: {
    simulateTransaction: (
      invocations: Array<{ type: "INVOKE"; payload: Call[] }>
    ) => Promise<unknown[]>;
  },
  options: PreflightOptions
): Promise<PreflightResult> {
  const { calls, feeMode } = options;

  try {
    const deployed = await wallet.isDeployed();
    if (!deployed) {
      if (isPaymasterMode(feeMode)) {
        return { ok: true };
      }
      return { ok: false, reason: "Account not deployed" };
    }

    const simulation = await account.simulateTransaction([
      { type: "INVOKE", payload: calls },
    ]);

    const revertReason = extractRevertReason(simulation[0]);
    if (revertReason !== null) {
      return { ok: false, reason: revertReason };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/** Build PaymasterDetails for sponsored or gasToken transactions. */
export function paymasterDetails(options: {
  feeMode: { type: "paymaster"; gasToken?: Address };
  timeBounds?: PaymasterTimeBounds | undefined;
  deploymentData?: PAYMASTER_API.ACCOUNT_DEPLOYMENT_DATA | undefined;
}) {
  const paymasterFeeMode = options.feeMode.gasToken
    ? { mode: "default" as const, gasToken: options.feeMode.gasToken }
    : { mode: "sponsored" as const };

  return {
    feeMode: paymasterFeeMode,
    ...(options.timeBounds && { timeBounds: options.timeBounds }),
    ...(options.deploymentData && { deploymentData: options.deploymentData }),
  };
}

/**
 * Safely extract a revert reason from a simulation result.
 * Returns the reason string, or `null` if the simulation succeeded.
 */
function extractRevertReason(result: unknown): string | null {
  if (!isRecord(result)) return null;
  const trace = result.transaction_trace;
  if (!isRecord(trace)) return null;
  const invocation = trace.execute_invocation;
  if (!isRecord(invocation)) return null;
  if ("revert_reason" in invocation) {
    return typeof invocation.revert_reason === "string"
      ? invocation.revert_reason
      : "Simulation failed";
  }
  return null;
}
