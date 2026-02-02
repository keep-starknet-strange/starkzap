import {
  RpcProvider,
  TransactionFinalityStatus,
  type Call,
  type PaymasterTimeBounds,
} from "starknet";
import { Tx } from "../tx/index.js";
import type { Address } from "../types/address.js";
import type {
  EnsureReadyOptions,
  PreflightOptions,
  PreflightResult,
} from "../types/wallet.js";
import type { ExplorerConfig } from "../types/config.js";

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
    deploy: () => Promise<Tx>;
  },
  options: EnsureReadyOptions = {}
): Promise<void> {
  const { deploy = "if_needed", onProgress } = options;

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
  const tx = await wallet.deploy();
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

/**
 * Execute calls with optional sponsorship.
 */
export async function executeWithFeeMode(
  account: {
    execute: (calls: Call[]) => Promise<{ transaction_hash: string }>;
    executePaymasterTransaction: (
      calls: Call[],
      details: {
        feeMode: { mode: "sponsored" };
        timeBounds?: PaymasterTimeBounds;
      }
    ) => Promise<{ transaction_hash: string }>;
  },
  calls: Call[],
  feeMode: "user_pays" | "sponsored",
  timeBounds: PaymasterTimeBounds | undefined,
  provider: RpcProvider,
  explorerConfig: ExplorerConfig | undefined
): Promise<Tx> {
  if (feeMode === "sponsored") {
    const paymasterDetails: {
      feeMode: { mode: "sponsored" };
      timeBounds?: PaymasterTimeBounds;
    } = {
      feeMode: { mode: "sponsored" },
    };
    if (timeBounds) {
      paymasterDetails.timeBounds = timeBounds;
    }

    const { transaction_hash } = await account.executePaymasterTransaction(
      calls,
      paymasterDetails
    );

    return new Tx(transaction_hash, provider, explorerConfig);
  }

  const { transaction_hash } = await account.execute(calls);
  return new Tx(transaction_hash, provider, explorerConfig);
}

/**
 * Build a sponsored transaction.
 */
export async function buildSponsoredTransaction(
  account: {
    buildPaymasterTransaction: (
      calls: Call[],
      details: {
        feeMode: { mode: "sponsored" };
        timeBounds?: PaymasterTimeBounds;
      }
    ) => Promise<unknown>;
  },
  calls: Call[],
  timeBounds: PaymasterTimeBounds | undefined
): Promise<unknown> {
  const paymasterDetails: {
    feeMode: { mode: "sponsored" };
    timeBounds?: PaymasterTimeBounds;
  } = {
    feeMode: { mode: "sponsored" },
  };
  if (timeBounds) {
    paymasterDetails.timeBounds = timeBounds;
  }

  return account.buildPaymasterTransaction(calls, paymasterDetails);
}
