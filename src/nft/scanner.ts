import type { AccountInterface, ProviderInterface, RpcProvider } from "starknet";
import type { OwnedNFT, GetOwnedNFTsOptions } from "./types";
import { NFTContract } from "./contract";

/**
 * Voyager API configuration.
 */
const VOYAGER_API_URL = "https://api.voyager.online/v1/nfts";
const VOYAGER_API_KEY = process.env.VOYAGER_API_KEY;

/**
 * NFT Collection Scanner — production-ready
 * Primary: Voyager API (fast)
 * Fallback: on-chain (balanceOf)
 */
export class NFTScanner {
  private provider: ProviderInterface;

  constructor(provider: RpcProvider | AccountInterface) {
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
      nftScanApiKey, // deprecated, kept for compatibility
      testnet = false,
      showAttribute = true,
    } = options;

    // Use Voyager API (preferred) or NFTScan (legacy fallback)
    const apiKey = nftScanApiKey || VOYAGER_API_KEY;

    if (!testnet && apiKey) {
      // Try Voyager first
      try {
        const voyagerNFTs = await this.fetchFromVoyager(userAddress, apiKey, collection, limit);
        if (voyagerNFTs.length > 0) {
          return voyagerNFTs;
        }
      } catch (e) {
        console.warn("Voyager API failed, trying NFTScan...", e);
      }

      // Fallback to NFTScan
      try {
        const nftscanNFTs = await this.fetchFromNFTScan(userAddress, apiKey, collection, limit, showAttribute);
        if (nftscanNFTs.length > 0) {
          return nftscanNFTs;
        }
      } catch (e) {
        console.warn("NFTScan failed, falling back to on-chain...", e);
      }
    }

    // On-chain fallback
    return this.scanOnChainSimple(userAddress, collection, limit);
  }

  /**
   * Fetch NFTs from Voyager API.
   */
  private async fetchFromVoyager(
    userAddress: string,
    apiKey: string,
    collection?: string,
    limit = 50
  ): Promise<OwnedNFT[]> {
    let url = `${VOYAGER_API_URL}?owner=${userAddress}&chain=starknet&limit=${limit}`;
    if (collection) {
      url += `&contract_address=${collection}`;
    }

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Voyager API error: ${res.status}`);
    }

    const json = await res.json();
    const items = json?.results || json?.data || [];

    return items.map((item: any) => ({
      collection: item.contract_address || item.collection,
      tokenId: item.token_id || item.tokenId,
      name: item.name,
      image: item.image_url || item.image,
      metadata: item.metadata,
    }));
  }

  /**
   * Fetch NFTs from NFTScan API (legacy).
   */
  private async fetchFromNFTScan(
    userAddress: string,
    apiKey: string,
    collection?: string,
    limit = 50,
    showAttribute = true
  ): Promise<OwnedNFT[]> {
    let url = `https://starknetapi.nftscan.com/api/v2/account/own/${userAddress}?limit=${limit}&show_attribute=${showAttribute}`;
    if (collection) {
      url += `&contract_address=${collection}`;
    }

    const res = await fetch(url, {
      headers: {
        "X-API-KEY": apiKey,
      },
    });

    if (!res.ok) {
      throw new Error(`NFTScan API error: ${res.status}`);
    }

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

  /**
   * Simple on-chain scanner using balanceOf.
   */
  private async scanOnChainSimple(
    userAddress: string,
    collection?: string,
    _limit = 50
  ): Promise<OwnedNFT[]> {
    if (!collection) {
      console.warn("On-chain scan requires 'collection' option. Use Voyager or NFTScan API for full scanning.");
      return [];
    }

    const nft = new NFTContract(collection as any, this.provider as RpcProvider);

    try {
      const balanceResult = await nft.balanceOf(userAddress as any);
      const balance = balanceResult.balance;

      if (balance === 0n) {
        return [];
      }

      console.warn(`Found ${balance} NFT(s). Use Voyager API for token enumeration.`);
      
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
