import {
  RpcProvider,
  TransactionFinalityStatus,
  type Call,
  type PaymasterTimeBounds,
} from "starknet";
import type { PAYMASTER_API } from "@starknet-io/starknet-types-010";
import { Tx } from "@/tx";
import type { Address } from "@/types";
import type {
  DeployOptions,
  EnsureReadyOptions,
  PreflightOptions,
  PreflightResult,
} from "@/types";

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
  } catch {
    return false;
  }
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

  onProgress?.({ step: "CONNECTED" });

  onProgress?.({ step: "CHECK_DEPLOYED" });
  const deployed = await wallet.isDeployed();

  if (deployed && deploy !== "always") {
    onProgress?.({ step: "READY" });
    return;
  }

  if (!deployed && deploy === "never") {
    throw new Error("Account not deployed and deploy mode is 'never'");
  }

  onProgress?.({ step: "DEPLOYING" });
  const tx = await wallet.deploy(feeMode ? { feeMode } : undefined);
  await tx.wait({
    successStates: [
      TransactionFinalityStatus.ACCEPTED_ON_L2,
      TransactionFinalityStatus.ACCEPTED_ON_L1,
    ],
  });

  onProgress?.({ step: "READY" });
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
  const { calls } = options;

  try {
    const deployed = await wallet.isDeployed();
    if (!deployed) {
      return { ok: false, reason: "Account not deployed" };
    }

    const simulation = await account.simulateTransaction([
      { type: "INVOKE", payload: calls },
    ]);

    const result = simulation[0] as Record<string, unknown> | undefined;
    if (result && "transaction_trace" in result && result.transaction_trace) {
      const trace = result.transaction_trace as Record<string, unknown>;
      if (
        "execute_invocation" in trace &&
        trace.execute_invocation &&
        typeof trace.execute_invocation === "object"
      ) {
        const invocation = trace.execute_invocation as Record<string, unknown>;
        if ("revert_reason" in invocation) {
          return {
            ok: false,
            reason: (invocation.revert_reason as string) ?? "Simulation failed",
          };
        }
      }
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/** Paymaster details for sponsored transactions */
export function sponsoredDetails(
  timeBounds?: PaymasterTimeBounds,
  deploymentData?: PAYMASTER_API.ACCOUNT_DEPLOYMENT_DATA
) {
  return {
    feeMode: { mode: "sponsored" as const },
    ...(timeBounds && { timeBounds }),
    ...(deploymentData && { deploymentData }),
  };
}
