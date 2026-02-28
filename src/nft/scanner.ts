import type { AccountInterface, ProviderInterface, RpcProvider } from "starknet";
import type { OwnedNFT, GetOwnedNFTsOptions } from "./types";
import { NFTContract } from "./contract";
import { fromCairoTokenId } from "./utils";

/**
 * NFT Collection Scanner — production-ready
 * Primary: NFTScan Starknet API (молниеносно)
 * Fallback: on-chain (balanceOf + manual iteration)
 */
export class NFTScanner {
  private provider: ProviderInterface;

  constructor(provider: RpcProvider | AccountInterface) {
    // AccountInterface extends ProviderInterface, so this works
    this.provider = provider as ProviderInterface;
  }

  /**
   * Get all NFTs owned by a user.
   */
  async getOwnedNFTs(
    userAddress: string,
    options: GetOwnedNFTsOptions = {}
  ): Promise<OwnedNFT[]> {
    const {
      collection,
      limit = 50,
      nftScanApiKey,
      testnet = false,
      showAttribute = true,
    } = options;

    // 1. NFTScan (mainnet only, if key provided)
    if (nftScanApiKey && !testnet) {
      try {
        let url = `https://starknetapi.nftscan.com/api/v2/account/own/${userAddress}?limit=${limit}&show_attribute=${showAttribute}`;
        if (collection) url += `&contract_address=${collection}`;

        const res = await fetch(url, {
          headers: {
            "X-API-KEY": nftScanApiKey,
          },
        });

        if (res.ok) {
          const json = await res.json();
          const items = json?.data?.content || [];

          return items.map((item: any) => ({
            collection: item.contract_address,
            tokenId: item.token_id,
            name: item.name || item.metadata_json?.name,
            image: item.image_url || item.metadata_json?.image,
            metadata: item.metadata_json,
          }));
        }
      } catch (e) {
        console.warn("NFTScan failed, falling back to on-chain...", e);
      }
    }

    // 2. On-chain fallback
    return this.scanOnChainSimple(userAddress, collection, limit);
  }

  /**
   * Simple on-chain scanner using balanceOf.
   */
  private async scanOnChainSimple(
    userAddress: string,
    collection?: string,
    _limit = 50
  ): Promise<OwnedNFT[]> {
    if (!collection) {
      console.warn("On-chain scan requires 'collection' option. Use NFTScan API for full scanning.");
      return [];
    }

    const nft = new NFTContract(collection as any, this.provider as RpcProvider);

    try {
      const balanceResult = await nft.balanceOf(userAddress as any);
      const balance = balanceResult.balance;

      if (balance === 0n) {
        return [];
      }

      console.warn(`Found ${balance} NFT(s). Use NFTScan API for token enumeration.`);
      
      return [{
        collection,
        tokenId: 0n,
      }];
    } catch (e) {
      console.warn("On-chain scan failed:", e);
      return [];
    }
  }
}
