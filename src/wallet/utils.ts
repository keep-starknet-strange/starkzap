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
 * Refuse a proof on a wallet that cannot produce one.
 *
 * `CartridgeWallet` has no {@link AccountProvider}, so it has no signer to
 * derive a viewing key from. No proof can belong to it.
 *
 * Separate from {@link assertProofSendable}. Each wallet calls the check that
 * applies to it.
 *
 * @param proof - The proof from `execute()` options, if any
 * @param wallet - Wallet name, for the message only
 */
export function assertProofUnsupported(
  proof: TransactionProof | undefined,
  wallet: string
): void {
  if (!proof) return;

  throw new Error(
    `[starkzap] ${wallet} cannot carry a transaction proof: privacy needs a ` +
      "locally-signed `Wallet`, whose own signer derives the viewing key. Build " +
      "and submit the proof through one of those instead."
  );
}

/**
 * Reject a proof-carrying transaction that cannot be sent, or that would
 * reveal the sender without consent.
 *
 * Three refusals:
 *
 * - **Empty proof.** A result from `simulate()` has no proof data.
 * - **Paymaster mode.** A SNIP-29 paymaster has no field for a proof. Use a
 *   privacy paymaster instead. See `PrivacyPaymaster`.
 * - **Self-submission without `unsafeUserPays`.** Sending from the user's own
 *   account records who sent it. The caller must opt in.
 *
 * The signer type is not checked. A remote signer can send a proof. Whether
 * it can derive the viewing key is checked in `createPrivacy`.
 *
 * @param proof - The proof from `wallet.execute()` options, if any
 * @param feeMode - The resolved fee mode for this execution
 * @param unsafeUserPays - Whether the caller accepted revealing the sender
 */
export function assertProofSendable(
  proof: TransactionProof | undefined,
  feeMode: FeeMode,
  unsafeUserPays?: boolean
): void {
  if (!proof) return;

  // `simulate()` runs a mock prover, so its proof has no data.
  if (proof.data.length === 0 || proof.proofFacts.length === 0) {
    throw new Error(
      "[starkzap] This proof carries no proof data, so the transaction would " +
        "revert on chain. A result from `simulate()` has the right shape but no " +
        "proof behind it — it is for estimating a fee, not for submitting. Prove " +
        "the transaction for real before sending it."
    );
  }

  if (isPaymasterMode(feeMode)) {
    throw new Error(
      "[starkzap] A SNIP-29 paymaster cannot carry a transaction proof: its " +
        "executable-transaction shape has no field for one, so the proof would be " +
        "dropped and the pool would revert. Submit through a privacy paymaster " +
        "instead (configure `privacy.paymaster`), or self-submit with " +
        '`feeMode: "user_pays"` and `unsafeUserPays: true`.'
    );
  }

  if (!unsafeUserPays) {
    throw new Error(
      "[starkzap] Refusing to self-submit a proof-carrying transaction: it would " +
        "be sent from this account, incrementing its nonce and paying gas from its " +
        "public balance, so the chain would record who performed the private " +
        "operation. Submit through a privacy paymaster (configure " +
        "`privacy.paymaster` and use `connectPrivacy()` from " +
        "`starkzap/privacy`), or pass " +
        "`unsafeUserPays: true` to accept revealing the sender."
    );
  }
}

/**
 * The block number a proof was generated from, taken from its proof facts.
 *
 * The felt after the `VIRTUAL_SNOS0` tag is the base block. Returns
 * `undefined` when the tag is absent, so an unknown layout does not reject a
 * valid proof.
 */
export function proofBaseBlock(proof: TransactionProof): number | undefined {
  const tag = shortString.encodeShortString("VIRTUAL_SNOS0");
  const facts = proof.proofFacts.map((f) => num.toHex(f));
  const blockIndex = facts.indexOf(num.toHex(tag)) + 1;
  if (blockIndex === 0 || blockIndex >= facts.length) return undefined;

  const block = Number(num.toBigInt(facts[blockIndex]!));
  return Number.isSafeInteger(block) && block > 0 ? block : undefined;
}

/**
 * Reject a proof whose base block is too recent or too old for the pool.
 *
 * Pure. Takes the chain head as an argument, so it is testable without a
 * provider. {@link assertProofFresh} reads the head and calls this.
 *
 * @param proof - The proof about to be submitted
 * @param head - Current chain head
 * @param depth - Blocks the base block must trail the head by
 * @param validityBlocks - Blocks the pool still accepts a proof for, when known
 */
export function assertProofBaseBlockAged(
  proof: TransactionProof,
  head: number,
  depth: number,
  validityBlocks?: number
): void {
  const base = proofBaseBlock(proof);
  if (base === undefined) return;
  const age = head - base;

  if (age < 0) {
    throw new Error(
      `[starkzap] This proof was generated against block ${base}, which is ` +
        `ahead of the head (${head}). Either it was not proved against this ` +
        "chain, or this RPC node is behind the one that proved it."
    );
  }

  if (age < depth) {
    throw new Error(
      `[starkzap] This proof was generated against block ${base}, only ${age} ` +
        `block(s) behind the head (${head}). The sequencer requires at least ` +
        `${depth}. Wait for the chain to advance and prove again — see ` +
        "`waitForProvableBlock`."
    );
  }

  // The pool also refuses a proof that is too old.
  if (validityBlocks !== undefined && age > validityBlocks) {
    throw new Error(
      `[starkzap] This proof was generated against block ${base}, ${age} blocks ` +
        `behind the head (${head}). The pool accepts a proof for ${validityBlocks} ` +
        "blocks, so this one has expired. Prove the transaction again."
    );
  }
}

/**
 * Fail fast on a proof the sequencer will refuse, before paying to submit it.
 *
 * Best effort. An unknown proof shape or a failed head read skips the check.
 * The check must never break a working transaction.
 *
 * @param proof - The proof about to be submitted
 * @param provider - Provider used to read the chain head
 * @param depth - Blocks the base block must trail the head by
 * @param poolAddress - Pool to read the validity window from, when configured
 */
export async function assertProofFresh(
  proof: TransactionProof,
  provider: RpcProvider,
  depth: number,
  poolAddress?: string
): Promise<void> {
  if (proofBaseBlock(proof) === undefined) return;

  // Both reads in parallel. They do not depend on each other.
  const [head, validityBlocks] = await Promise.all([
    provider.getBlockNumber().catch(() => undefined),
    readProofValidityBlocks(provider, poolAddress),
  ]);
  if (head === undefined) return;

  assertProofBaseBlockAged(proof, head, depth, validityBlocks);
}

/**
 * How many blocks the pool accepts a proof for, or `undefined` when unknown.
 *
 * Read from the pool, because the figure is per deployment. `undefined` on any
 * failure, so only the lower bound is checked then.
 */
async function readProofValidityBlocks(
  provider: RpcProvider,
  poolAddress: string | undefined
): Promise<number | undefined> {
  if (poolAddress === undefined) return undefined;

  try {
    const [value] = await provider.callContract({
      contractAddress: poolAddress,
      entrypoint: "get_proof_validity_blocks",
      calldata: [],
    });
    const blocks = Number(num.toBigInt(value ?? ""));
    return Number.isSafeInteger(blocks) && blocks > 0 ? blocks : undefined;
  } catch {
    return undefined;
  }
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
