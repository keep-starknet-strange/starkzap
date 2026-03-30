import { AbiCoder, dataSlice, type TransactionReceipt } from "ethers";
import { constants, hash } from "starknet";

const ZERO = "0x0";

/**
 * The topic emitted by the Starknet Core Contract when a message is sent to L2.
 * Event: `LogMessageToL2(fromAddress, toAddress, selector, payload[], nonce, fee)`
 */
const L2_MSG_TOPIC =
  "0xdb80dd488acf86d17c747445b0eabb5d57c541d3bd7b6b87af987858e5066b2b";

/**
 * Derives the Starknet L1-handler transaction hash from an Ethereum deposit receipt.
 *
 * The derivation mirrors the algorithm used by StarkGate's live-transfers package:
 * it parses the `LogMessageToL2` event emitted by the Starknet Core Contract and
 * re-computes the L2 transaction hash using the same Pedersen-hash formula applied
 * by the Starknet sequencer.
 *
 * @param receipt - Mined Ethereum transaction receipt of the deposit.
 * @param snChainIdFelt252 - The Starknet chain ID as a felt252 hex string
 *   (e.g. `constants.StarknetChainId.SN_MAIN`). Use `ChainId.toFelt252()`.
 * @returns The predicted Starknet transaction hash, or `null` if the receipt
 *   does not contain a `LogMessageToL2` event.
 */
export function deriveStarknetDepositTxHash(
  receipt: TransactionReceipt,
  snChainIdFelt252: string
): string | null {
  const log = receipt.logs.find((l) => l.topics[0] === L2_MSG_TOPIC);
  if (!log || !log.topics[1] || !log.topics[2] || !log.topics[3]) {
    return null;
  }

  const decoded = AbiCoder.defaultAbiCoder().decode(
    ["uint256[]", "uint256", "uint256"],
    dataSlice(log.data)
  ) as unknown as [bigint[], bigint, bigint];
  const [payload, nonce] = decoded;

  return hash.computeHashOnElements([
    constants.TransactionHashPrefix.L1_HANDLER,
    ZERO,
    log.topics[2], // toAddress (L2 contract)
    log.topics[3], // entry-point selector
    hash.computeHashOnElements([log.topics[1], ...payload]), // calldata hash: [fromAddress, ...payload]
    ZERO,
    snChainIdFelt252,
    nonce,
  ]);
}
