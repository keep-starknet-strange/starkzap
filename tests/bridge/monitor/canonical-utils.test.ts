import { describe, expect, it } from "vitest";
import { AbiCoder, type TransactionReceipt } from "ethers";
import { constants, hash } from "starknet";
import { deriveStarknetDepositTxHash } from "@/bridge/monitor/canonical/utils";

/** Event topic0: `LogMessageToL2` (Starknet Core Contract). Must match `canonical/utils.ts`. */
const L2_MSG_TOPIC =
  "0xdb80dd488acf86d17c747445b0eabb5d57c541d3bd7b6b87af987858e5066b2b";

const ZERO = "0x0";

function expectedL1HandlerHash(
  receipt: TransactionReceipt,
  snChainIdFelt252: string
): string {
  const log = receipt.logs.find((l) => l.topics[0] === L2_MSG_TOPIC)!;
  const decoded = AbiCoder.defaultAbiCoder().decode(
    ["uint256[]", "uint256", "uint256"],
    log.data
  ) as unknown as [bigint[], bigint, bigint];
  const [payload] = decoded;
  const nonce = decoded[1];

  return hash.computeHashOnElements([
    constants.TransactionHashPrefix.L1_HANDLER,
    ZERO,
    log.topics[2]!,
    log.topics[3]!,
    hash.computeHashOnElements([log.topics[1]!, ...payload]),
    ZERO,
    snChainIdFelt252,
    nonce,
  ]);
}

describe("deriveStarknetDepositTxHash", () => {
  it("returns null when no LogMessageToL2 log is present", () => {
    const receipt = {
      logs: [
        {
          topics: [
            "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          ],
          data: "0x",
        },
      ],
    } as unknown as TransactionReceipt;

    expect(
      deriveStarknetDepositTxHash(receipt, constants.StarknetChainId.SN_SEPOLIA)
    ).toBeNull();
  });

  it("returns null when required topics are missing", () => {
    const data = AbiCoder.defaultAbiCoder().encode(
      ["uint256[]", "uint256", "uint256"],
      [[], 1n, 0n]
    );
    const receipt = {
      logs: [
        {
          topics: [L2_MSG_TOPIC, "0x01"],
          data,
        },
      ],
    } as unknown as TransactionReceipt;

    expect(
      deriveStarknetDepositTxHash(receipt, constants.StarknetChainId.SN_SEPOLIA)
    ).toBeNull();
  });

  it("derives the L1-handler tx hash from a valid LogMessageToL2 fixture", () => {
    const topics = [
      L2_MSG_TOPIC,
      "0x0000000000000000000000000000000000000000000000000000000000000abc",
      "0x0000000000000000000000000000000000000000000000000000000000000def",
      "0x0000000000000000000000000000000000000000000000000000000000000242",
    ] as [string, string, string, string];

    const payload: bigint[] = [1n, 2n, 3n];
    const encoded = AbiCoder.defaultAbiCoder().encode(
      ["uint256[]", "uint256", "uint256"],
      [payload, 99n, 0n]
    );

    const receipt = {
      logs: [{ topics, data: encoded }],
    } as unknown as TransactionReceipt;

    const chainId = constants.StarknetChainId.SN_SEPOLIA;
    const derived = deriveStarknetDepositTxHash(receipt, chainId);
    const expected = expectedL1HandlerHash(receipt, chainId);

    expect(derived).toEqual(expected);
    expect(derived).toMatch(/^0x[0-9a-f]+$/i);
  });

  it("changes when Starknet chain id changes", () => {
    const topics = [
      L2_MSG_TOPIC,
      "0x0000000000000000000000000000000000000000000000000000000000000001",
      "0x0000000000000000000000000000000000000000000000000000000000000002",
      "0x0000000000000000000000000000000000000000000000000000000000000003",
    ] as [string, string, string, string];

    const data = AbiCoder.defaultAbiCoder().encode(
      ["uint256[]", "uint256", "uint256"],
      [[], 7n, 0n]
    );

    const receipt = {
      logs: [{ topics, data }],
    } as unknown as TransactionReceipt;

    const a = deriveStarknetDepositTxHash(
      receipt,
      constants.StarknetChainId.SN_SEPOLIA
    );
    const b = deriveStarknetDepositTxHash(
      receipt,
      constants.StarknetChainId.SN_MAIN
    );

    expect(a).not.toBe(b);
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
  });
});
