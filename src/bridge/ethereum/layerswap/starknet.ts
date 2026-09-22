import { Amount, type Address } from "@/types";
import { DUMMY_SN_ADDRESS } from "@/bridge/ethereum/types";
import { FeeErrorCause } from "@/types/errors";
import type { LsDepositAction } from "@/bridge/ethereum/layerswap/types";
import type { StarkZapLogger } from "@/logger";
import type { WalletInterface } from "@/wallet";
import { type Call, CallData, num, uint256 } from "starknet";

/**
 * Parse and validate Layerswap's Starknet deposit-action `call_data`.
 *
 * Layerswap delivers Starknet calls as a JSON-encoded `Call` or `Call[]`, and
 * the user's wallet signs whatever comes back, so every call is checked against
 * a whitelist. A call on the bridge token must be a `transfer`, and at least
 * one such transfer must be present. Any other call must target a contract in
 * `allowedContracts`, the integrator-vetted list from
 * `bridging.layerswapAllowedContracts`. With no list, only the transfer is
 * accepted: an API response that adds an `approve` or a call to an unknown
 * contract is refused before anything is signed.
 *
 * Addresses only, any entrypoint on a listed contract. Per-address entrypoint
 * restrictions can be added if a route ever needs them.
 */
export function parseLayerswapStarknetCalls(
  action: LsDepositAction,
  expectedContractAddress: string,
  allowedContracts: readonly Address[] = []
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
  const allowed = new Set(allowedContracts.map((a) => num.toHex64(a)));

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
    const target = num.toHex64(call.contractAddress);
    if (target === expected) {
      if (call.entrypoint !== "transfer") {
        throw new Error(
          `Layerswap call_data entry ${i} uses unexpected bridge-token entrypoint "${call.entrypoint}" (expected "transfer").`
        );
      }
      hasExpectedTransfer = true;
    } else if (!allowed.has(target)) {
      throw new Error(
        `Layerswap call_data entry ${i} calls ${call.contractAddress} (entrypoint "${call.entrypoint}"), which is not the bridge token and not in \`bridging.layerswapAllowedContracts\`. Nothing was signed. Inspect this call, and list the contract if it is a Layerswap helper you trust.`
      );
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
