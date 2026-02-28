import type { AccountInterface, Call } from "starknet";
import type {
  MarketplaceType,
  CreateListingParams,
  BuyNFTParams,
} from "./types";
import { NFTContract } from "./contract";

/**
 * Active marketplace configuration.
 */
export const MARKETPLACE_CONFIG: Record<MarketplaceType, { address: string; active: boolean }> = {
  aspect: { address: "0x02a92f0f860bf7c63fb9ef42cff4137006b309e0e6e1484e42d0b5511959414d", active: false },
  unframed: { address: "0x051734077ba7baf5765896c56ce10b389d80cdcee8622e23c0556fb49e82df1b", active: false },
  flex: { address: "0x1c0c00f578944fc4cf22ebaf25c81bb25c9a2c1e3f69fb0e7e5d7341a46bddc", active: true },
  element: { address: "0x5816ab449ee30b9286ef7bea5f9faa38b87a3b9c7f225d14b4001c9273b6deb", active: true },
  custom: { address: "0x0", active: true },
};

/**
 * Get active marketplace from environment or default to element.
 */
export function getActiveMarketplace(): MarketplaceType {
  const env = process.env.ACTIVE_MARKETPLACE as MarketplaceType | undefined;
  if (env && MARKETPLACE_CONFIG[env]?.active) {
    return env;
  }
  return "element";
}

/**
 * NFT Marketplace Helpers.
 * Supports Element and Flex marketplaces.
 */
export class NFTMarketplace {
  private account: AccountInterface;
  private defaultMarketplace: MarketplaceType;

  constructor(account: AccountInterface, defaultMarketplace?: MarketplaceType) {
    this.account = account;
    this.defaultMarketplace = defaultMarketplace || getActiveMarketplace();
  }

  /**
   * Get marketplace contract address with validation.
   */
  private getMarketplaceAddress(marketplace?: MarketplaceType, customAddress?: string): string {
    const market = marketplace || this.defaultMarketplace;
    
    if (market === "custom" && customAddress) {
      return customAddress;
    }

    const config = MARKETPLACE_CONFIG[market];
    if (!config || !config.active) {
      throw new Error(`Marketplace '${market}' is not active. Use 'element' or 'flex'.`);
    }
    
    return config.address;
  }

  /**
   * Approve NFT for marketplace (setApprovalForAll).
   */
  async approveForMarketplace(
    marketplace?: MarketplaceType,
    collection?: string,
    customAddress?: string
  ) {
    const market = marketplace || this.defaultMarketplace;
    const coll = collection || "";
    const operator = this.getMarketplaceAddress(market, customAddress);
    const nft = new NFTContract(coll as any, this.account as any);
    const call = nft.buildSetApprovalForAllCall(operator as any, true);
    return this.account.execute([call]);
  }

  /**
   * Create a listing on the marketplace.
   */
  async createListing(params: CreateListingParams) {
    const { collection, tokenId, price, marketplace, customAddress } = params;
    const market = marketplace || this.defaultMarketplace;
    const marketplaceAddress = this.getMarketplaceAddress(market, customAddress);

    // Approve marketplace first if needed
    await this.approveForMarketplace(market, collection, customAddress);

    let call: Call;

    switch (market) {
      case "element":
        // Element: create_order(collection, token_id, price)
        call = {
          contractAddress: marketplaceAddress,
          entrypoint: "create_order",
          calldata: [
            collection,
            typeof tokenId === "bigint" ? tokenId.toString() : tokenId,
            price.toString(),
          ],
        };
        break;

      case "flex":
        // Flex: list(token_id, price)
        call = {
          contractAddress: marketplaceAddress,
          entrypoint: "list",
          calldata: [
            typeof tokenId === "bigint" ? tokenId.toString() : tokenId,
            price.toString(),
          ],
        };
        break;

      default:
        call = {
          contractAddress: marketplaceAddress,
          entrypoint: "create_order",
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
    const market = marketplace || this.defaultMarketplace;
    const marketplaceAddress = this.getMarketplaceAddress(market, customAddress);

    let call: Call;

    switch (market) {
      case "element":
        // Element: fulfill_order(order_id)
        call = {
          contractAddress: marketplaceAddress,
          entrypoint: "fulfill_order",
          calldata: [collection, typeof tokenId === "bigint" ? tokenId.toString() : tokenId],
        };
        break;

      case "flex":
        // Flex: buy(listing_id)
        call = {
          contractAddress: marketplaceAddress,
          entrypoint: "buy",
          calldata: [collection, typeof tokenId === "bigint" ? tokenId.toString() : tokenId],
        };
        break;

      default:
        call = {
          contractAddress: marketplaceAddress,
          entrypoint: "fulfill_order",
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
      case "element":
        call = {
          contractAddress: marketplaceAddress,
          entrypoint: "cancel_order",
          calldata: [listingId],
        };
        break;

      case "flex":
        call = {
          contractAddress: marketplaceAddress,
          entrypoint: "delist",
          calldata: [collection, listingId],
        };
        break;

      default:
        call = {
          contractAddress: marketplaceAddress,
          entrypoint: "cancel_order",
          calldata: [listingId],
        };
    }

    return this.account.execute([call]);
  }
}
