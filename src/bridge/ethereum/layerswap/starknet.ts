import { Amount } from "@/types";
import { DUMMY_SN_ADDRESS } from "@/bridge/ethereum/types";
import { FeeErrorCause } from "@/types/errors";
import type { LsDepositAction } from "@/bridge/ethereum/layerswap/types";
import type { StarkZapLogger } from "@/logger";
import type { WalletInterface } from "@/wallet";
import { type Call, CallData, num, uint256 } from "starknet";

/**
 * Parse and validate Layerswap's Starknet deposit-action `call_data`.
 *
 * Layerswap delivers Starknet calls as a JSON-encoded `Call` or `Call[]`.
 * Since these calls are signed by the user's Starknet wallet, we require the
 * payload to contain a `transfer` on the bridge token contract. Layerswap can
 * include extra helper calls to its own contracts, so those are passed through;
 * direct calls to the bridge token contract must still be transfers.
 */
export function parseLayerswapStarknetCalls(
  action: LsDepositAction,
  expectedContractAddress: string
): Call[] {
  if (!action.call_data) {
    throw new Error(
      `Starknet deposit action (order ${action.order}) has no call_data.`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(action.call_data);
  } catch (e) {
    throw new Error(
      `Failed to parse Layerswap Starknet call_data as JSON: ${
        (e as Error).message
      }`
    );
  }

  const raw = (Array.isArray(parsed) ? parsed : [parsed]) as unknown[];
  if (raw.length === 0) {
    throw new Error(
      `Layerswap returned no Starknet calls (order ${action.order}).`
    );
  }

  const expected = num.toHex64(expectedContractAddress);

  let hasExpectedTransfer = false;
  const calls = raw.map((entry, i) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as Call).contractAddress !== "string" ||
      typeof (entry as Call).entrypoint !== "string"
    ) {
      throw new Error(
        `Layerswap Starknet call_data entry ${i} is missing required Call fields.`
      );
    }
    const call = entry as Call;
    if (num.toHex64(call.contractAddress) === expected) {
      if (call.entrypoint !== "transfer") {
        throw new Error(
          `Layerswap call_data entry ${i} uses unexpected bridge-token entrypoint "${call.entrypoint}" (expected "transfer").`
        );
      }
      hasExpectedTransfer = true;
    }
    return call;
  });

  if (!hasExpectedTransfer) {
    throw new Error(
      `Layerswap Starknet call_data does not include a transfer on expected bridge token "${expectedContractAddress}".`
    );
  }

  return calls;
}

/** Build a dummy Starknet `transfer` call for L2 fee estimation. */
export function buildDummyStarknetTransferCalls(tokenAddress: string): Call[] {
  return [
    {
      contractAddress: tokenAddress,
      entrypoint: "transfer",
      calldata: CallData.compile({
        recipient: DUMMY_SN_ADDRESS.toString(),
        amount: uint256.bnToUint256(1n),
      }),
    },
  ];
}

/** Estimate the Starknet L2 fee for a set of calls. */
export async function estimateStarknetFee(
  wallet: WalletInterface,
  calls: Call[],
  logger: StarkZapLogger,
  tag: string
): Promise<{ fee: Amount; error?: FeeErrorCause }> {
  try {
    const estimate = await wallet.estimateFee(calls);
    const isFri = estimate.unit === "FRI";
    return {
      fee: Amount.fromRaw(estimate.overall_fee, 18, isFri ? "STRK" : "ETH"),
    };
  } catch (e) {
    logger.debug(`[${tag}] estimateStarknetFee failed:`, e);
    return {
      fee: Amount.fromRaw(0n, 18, "STRK"),
      error: FeeErrorCause.GENERIC_L2_FEE_ERROR,
    };
  }
}
