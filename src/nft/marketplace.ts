import type { AccountInterface, ProviderInterface, RpcProvider, Call } from "starknet";
import type {
  MarketplaceType,
  CreateListingParams,
  BuyNFTParams,
} from "./types";
import { NFTContract } from "./contract";

/**
 * Known marketplace contract addresses on Starknet Mainnet.
 */
export const MARKETPLACE_ADDRESSES: Record<MarketplaceType, string> = {
  aspect: "0x02a92f0f860bf7c63fb9ef42cff4137006b309e0e6e1484e42d0b5511959414d",
  unframed: "0x051734077ba7baf5765896c56ce10b389d80cdcee8622e23c0556fb49e82df1b",
  flex: "0x04c0a5193d58f74fbace4b74d843654f0370d6a0ed16d3f6f6e5f93a4007e6a3",
  element: "0x02a4f62d4c1ad1e86da4eb30d2e8f4e7c3a9a6f2e1d3c4b5a6f7e8d9c0b1a2",
  custom: "0x0",
};

/**
 * NFT Marketplace Helpers.
 * Supports Aspect, Unframed, Flex, Element marketplaces.
 */
export class NFTMarketplace {
  private account: AccountInterface;

  constructor(account: AccountInterface) {
    this.account = account;
  }

  /**
   * Get marketplace contract address.
   */
  private getMarketplaceAddress(marketplace: MarketplaceType, customAddress?: string): string {
    if (marketplace === "custom" && customAddress) {
      return customAddress;
    }
    return MARKETPLACE_ADDRESSES[marketplace];
  }

  /**
   * Approve NFT for marketplace (setApprovalForAll).
   */
  async approveForMarketplace(
    marketplace: MarketplaceType,
    collection: string,
    customAddress?: string
  ) {
    const operator = this.getMarketplaceAddress(marketplace, customAddress);
    const nft = new NFTContract(collection as any, this.account as unknown as RpcProvider);
    const call = nft.buildSetApprovalForAllCall(operator as any, true);
    return this.account.execute([call]);
  }

  /**
   * Create a listing on the marketplace.
   */
  async createListing(params: CreateListingParams) {
    const { collection, tokenId, price, marketplace, customAddress } = params;
    const marketplaceAddress = this.getMarketplaceAddress(marketplace, customAddress);

    // Approve marketplace first if needed
    await this.approveForMarketplace(marketplace, collection, customAddress);

    let call: Call;

    switch (marketplace) {
      case "aspect":
        call = {
          contractAddress: marketplaceAddress,
          entrypoint: "list",
          calldata: [
            typeof tokenId === "bigint" ? tokenId.toString() : tokenId,
            price.toString(),
          ],
        };
        break;

      case "unframed":
        call = {
          contractAddress: marketplaceAddress,
          entrypoint: "create_listing",
          calldata: [
            collection,
            typeof tokenId === "bigint" ? tokenId.toString() : tokenId,
            price.toString(),
          ],
        };
        break;

      default:
        call = {
          contractAddress: marketplaceAddress,
          entrypoint: "create_listing",
          calldata: [
            collection,
            typeof tokenId === "bigint" ? tokenId.toString() : tokenId,
            price.toString(),
          ],
        };
    }

    return this.account.execute([call]);
  }

  /**
   * Buy NFT from a marketplace listing.
   */
  async buyNFT(params: BuyNFTParams) {
    const { collection, tokenId, price, marketplace, customAddress } = params;
    const marketplaceAddress = this.getMarketplaceAddress(marketplace, customAddress);

    let call: Call;

    switch (marketplace) {
      case "aspect":
        call = {
          contractAddress: marketplaceAddress,
          entrypoint: "buy",
          calldata: [collection, typeof tokenId === "bigint" ? tokenId.toString() : tokenId],
        };
        break;

      case "unframed":
        call = {
          contractAddress: marketplaceAddress,
          entrypoint: "fulfill_listing",
          calldata: [collection, typeof tokenId === "bigint" ? tokenId.toString() : tokenId],
        };
        break;

      default:
        call = {
          contractAddress: marketplaceAddress,
          entrypoint: "buy",
          calldata: [
            collection,
            typeof tokenId === "bigint" ? tokenId.toString() : tokenId,
            price.toString(),
          ],
        };
    }

    return this.account.execute([call]);
  }

  /**
   * Cancel a listing.
   */
  async cancelListing(
    marketplace: MarketplaceType,
    listingId: string,
    collection: string,
    customAddress?: string
  ) {
    const marketplaceAddress = this.getMarketplaceAddress(marketplace, customAddress);

    let call: Call;

    switch (marketplace) {
      case "aspect":
        call = {
          contractAddress: marketplaceAddress,
          entrypoint: "cancel_listing",
          calldata: [listingId],
        };
        break;

      default:
        call = {
          contractAddress: marketplaceAddress,
          entrypoint: "cancel",
          calldata: [collection, listingId],
        };
    }

    return this.account.execute([call]);
  }
}
