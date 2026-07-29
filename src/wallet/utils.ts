import {
  RpcProvider,
  RpcError,
  num,
  shortString,
  TransactionFinalityStatus,
  type Call,
  type PaymasterTimeBounds,
} from "starknet";
import type { PAYMASTER_API } from "@starknet-io/starknet-types-0103";
import { Tx } from "@/tx";
import { isRecord } from "@/utils/ekubo";
import type { Address } from "@/types";
import type {
  DeployOptions,
  EnsureReadyOptions,
  FeeMode,
  PreflightOptions,
  PreflightResult,
  TransactionProof,
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
 * Reject a proof-carrying transaction the caller cannot actually send, or should
 * not send unknowingly.
 *
 * Three separate refusals:
 *
 * - **Wrong wallet.** Only a locally-signed `Wallet` can produce the viewing key
 *   the pool needs, so a Cartridge or Privy wallet cannot carry a proof at all.
 * - **Paymaster mode.** starknet.js's SNIP-29 paymaster has no field for a
 *   proof, so the proof would be silently dropped and the pool would revert.
 *   A *privacy* paymaster can carry one, but it is not this code path. See
 *   `PrivacyPaymaster`.
 * - **Unacknowledged self-submission.** Sending a proof from the user's own
 *   account works, but records who sent it. That has to be opted into.
 *
 * @param proof - The proof from `wallet.execute()` options, if any
 * @param feeMode - The resolved fee mode for this execution
 * @param wallet - Wallet description used in the error message
 * @param unsafeUserPays - Whether the caller accepted revealing the sender
 */
export function assertProofSendable(
  proof: TransactionProof | undefined,
  feeMode: FeeMode,
  wallet: string,
  unsafeUserPays?: boolean
): void {
  if (!proof) return;

  if (wallet !== "Wallet") {
    throw new Error(
      `[starkzap] ${wallet} cannot send proof-carrying transactions. Privacy operations require a Wallet backed by a StarkSigner.`
    );
  }

  if (isPaymasterMode(feeMode)) {
    throw new Error(
      "[starkzap] A SNIP-29 paymaster cannot carry a transaction proof: its " +
        "executable-transaction shape has no field for one, so the proof would be " +
        "dropped and the pool would revert. Submit through a privacy paymaster " +
        "instead (configure `privacy.paymasterUrl`), or self-submit with " +
        '`feeMode: "user_pays"` and `unsafeUserPays: true`.'
    );
  }

  if (!unsafeUserPays) {
    throw new Error(
      "[starkzap] Refusing to self-submit a proof-carrying transaction: it would " +
        "be sent from this account, incrementing its nonce and paying gas from its " +
        "public balance, so the chain would record who performed the private " +
        "operation. Submit through a privacy paymaster (configure " +
        "`privacy.paymasterUrl` and use `wallet.privacy()`), or pass " +
        "`unsafeUserPays: true` to accept revealing the sender."
    );
  }
}

/**
 * The block number a proof was generated from, taken from its proof facts.
 *
 * The facts are a tag-then-payload list; the felt after the `VIRTUAL_SNOS0` tag
 * is the base block. Returns `undefined` when the tag is absent — the layout is
 * the proving service's, not ours, so an unrecognised shape must not turn a
 * valid proof away.
 */
export function proofBaseBlock(proof: TransactionProof): number | undefined {
  const tag = shortString.encodeShortString("VIRTUAL_SNOS0");
  const facts = proof.proofFacts.map((f) => num.toHex(f));
  const block_index = facts.indexOf(num.toHex(tag)) + 1;
  if (block_index === 0 || block_index >= facts.length) return undefined;

  const block = Number(num.toBigInt(facts[block_index]!));
  return Number.isSafeInteger(block) && block > 0 ? block : undefined;
}

/**
 * Reject a proof whose base block is too recent for the sequencer to accept.
 *
 * Pure: takes the head rather than reading it, so the comparison is testable
 * without a provider. See {@link assertProofFresh} for the IO wrapper.
 *
 * @param proof - The proof about to be submitted
 * @param head - Current chain head
 * @param depth - Blocks the base block must trail the head by
 */
export function assertProofBaseBlockAged(
  proof: TransactionProof,
  head: number,
  depth: number
): void {
  const base = proofBaseBlock(proof);
  if (base === undefined) return;

  if (head - base < depth) {
    throw new Error(
      `[starkzap] This proof was generated against block ${base}, only ${
        head - base
      } block(s) behind the head (${head}). The sequencer requires at least ${depth}. ` +
        "Wait for the chain to advance and prove again — see `waitForProvableBlock`."
    );
  }
}

/**
 * Fail fast on a proof the sequencer will refuse, before paying to submit it.
 *
 * Deliberately best-effort. The base block is read from the proof first, so a
 * proof shape we do not recognise costs no RPC call at all, and a failed head
 * read is swallowed: this exists to turn one opaque on-chain revert into a clear
 * local error, and a check that can itself break a working transaction would be
 * worse than the problem it solves.
 *
 * @param proof - The proof about to be submitted
 * @param provider - Provider used to read the chain head
 * @param depth - Blocks the base block must trail the head by
 */
export async function assertProofFresh(
  proof: TransactionProof,
  provider: RpcProvider,
  depth: number
): Promise<void> {
  if (proofBaseBlock(proof) === undefined) return;

  let head: number;
  try {
    head = await provider.getBlockNumber();
  } catch {
    return;
  }

  assertProofBaseBlockAged(proof, head, depth);
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
    ) => Promise<{ simulated_transactions: unknown[] } | unknown[]>;
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

    return preflightFromSimulation(simulation);
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
 * Derive a preflight verdict from a raw `simulateTransaction` response.
 *
 * Response shape depends on the resolved starknet version: v10 returns
 * `{ simulated_transactions }`, while v8/v9 returns a bare array. An
 * unrecognized or empty response is treated as a pass — preflight is a
 * best-effort revert check, so an unreadable simulation must not block a
 * transaction that would otherwise succeed.
 */
export function preflightFromSimulation(simulation: unknown): PreflightResult {
  const results = Array.isArray(simulation)
    ? simulation
    : isRecord(simulation)
      ? simulation.simulated_transactions
      : undefined;
  const revertReason = extractRevertReason(
    Array.isArray(results) ? results[0] : undefined
  );
  return revertReason !== null
    ? { ok: false, reason: revertReason }
    : { ok: true };
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
