import type { AccountInterface, ProviderInterface, RpcProvider, Call } from "starknet";
import type { ApprovalItem } from "./types";
import type { Address } from "@/types";
import { NFTContract } from "./contract";

/**
 * NFT Approvals — batch setApprovalForAll
 */
export class NFTApprovals {
  private provider: ProviderInterface;

  constructor(provider: RpcProvider | AccountInterface) {
    this.provider = provider as ProviderInterface;
  }

  /**
   * Batch setApprovalForAll для нескольких коллекций.
   */
  async setApprovalForAllBatch(
    approvals: ApprovalItem[],
    _options: { usePaymaster?: boolean } = {}
  ): Promise<unknown> {
    const calls: Call[] = approvals.map(({ collection, operator, approved }) => {
      const nft = new NFTContract(collection as Address, this.provider as RpcProvider);
      return nft.buildSetApprovalForAllCall(operator as Address, approved);
    });

    // Execute as multicall - need Account for execute, not just provider
    if ('execute' in this.provider) {
      return (this.provider as AccountInterface).execute(calls);
    }
    throw new Error("Provider must be an Account to execute transactions");
  }
}
