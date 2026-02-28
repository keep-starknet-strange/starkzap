import type { Address } from "@/types";

/**
 * NFT Token ID representation.
 * Starknet uses u256 for token IDs (split into low/highfelt).
 */
export type TokenId = bigint | string;

/**
 * ERC721/ERC1155 Transfer parameters.
 */
export type NFTTransferParams = {
  /** Contract address of the NFT collection. */
  tokenAddress: Address;
  /** Recipient address. */
  to: Address;
  /** Token ID to transfer. */
  tokenId: TokenId;
  /** Optional data for safe transfers (ERC721Safe or ERC1155). */
  data?: string;
  /** Use paymaster for gasless transactions. */
  usePaymaster?: boolean;
};

/**
 * Batch transfer parameters.
 */
export type NFTBatchTransferParams = {
  /** Contract address of the NFT collection. */
  tokenAddress: Address;
  /** Array of transfers. */
  transfers: Array<{
    /** Recipient address. */
    to: Address;
    /** Token ID to transfer. */
    tokenId: TokenId;
    /** Amount for ERC1155 (defaults to 1 for ERC721). */
    amount?: bigint;
  }>;
  /** Optional data for safe transfers. */
  data?: string;
  /** Use paymaster for gasless transactions. */
  usePaymaster?: boolean;
};

/**
 * NFT balance query result.
 */
export type NFTBalance = {
  /** Number of tokens owned. */
  balance: bigint;
  /** Token IDs owned (for ERC721, max 100 for performance). */
  tokenIds?: TokenId[];
};

/**
 * NFT owner result.
 */
export type NFTOwner = {
  /** Owner address. */
  owner: Address;
  /** Whether the owner is confirmed. */
  confirmed: boolean;
};

/**
 * Approval status.
 */
export type NFTApproval = {
  /** Whether the operator is approved for all tokens. */
  isApproved: boolean;
};

/**
 * NFT metadata.
 */
export type NFTMetadata = {
  /** Token ID. */
  tokenId: TokenId;
  /** Collection name. */
  name?: string;
  /** Collection description. */
  description?: string;
  /** Image URL (supports IPFS). */
  image?: string;
  /** External URL. */
  external_url?: string;
  /** Animation URL (supports IPFS). */
  animation_url?: string;
  /** Custom attributes. */
  attributes?: Array<{
    trait_type: string;
    value: string | number;
  }>;
  /** Raw URI from contract. */
  rawUri?: string;
};

/**
 * NFT standard type.
 */
export type NFTStandard = "erc721" | "erc1155";

/**
 * NFT contract info.
 */
export type NFTContractInfo = {
  /** Contract address. */
  address: Address;
  /** Detected standard. */
  standard: NFTStandard;
  /** Collection name. */
  name?: string;
  /** Collection symbol. */
  symbol?: string;
  /** Base URI. */
  baseUri?: string;
};

/**
 * Options for NFT operations.
 */
export type NFTOptions = {
  /** Use paymaster for gasless transactions. */
  usePaymaster?: boolean;
  /** Multicall mode for batch operations. */
  multicall?: boolean;
};

/**
 * User NFT query parameters.
 */
export type GetUserNFTsParams = {
  /** User address to query. */
  address: Address;
  /** Contract address (optional, for specific collection). */
  contractAddress?: Address;
  /** Page size. */
  limit?: number;
  /** Offset for pagination. */
  offset?: number;
};

/**
 * Owned NFT item from scanner.
 */
export interface OwnedNFT {
  /** Collection contract address. */
  collection: string;
  /** Token ID. */
  tokenId: TokenId;
  /** Collection/token name. */
  name?: string;
  /** Image URL. */
  image?: string;
  /** Full metadata. */
  metadata?: Record<string, any>;
}

/**
 * Options for getOwnedNFTs.
 */
export interface GetOwnedNFTsOptions {
  /** Filter by specific collection (recommended for speed). */
  collection?: string;
  /** Maximum NFTs (NFTScan limit 100, fallback up to 200). */
  limit?: number;
  /** NFTScan API key (get free at https://developer.nftscan.com). */
  nftScanApiKey?: string;
  /** Use testnet (only on-chain fallback). */
  testnet?: boolean;
  /** Include attributes in metadata. */
  showAttribute?: boolean;
}

/**
 * Single approval item for batch operations.
 */
export interface ApprovalItem {
  /** Collection contract address (ERC721 or ERC1155). */
  collection: string;
  /** Operator address (marketplace, bridge, etc.). */
  operator: string;
  /** true = approve, false = revoke. */
  approved: boolean;
}

/**
 * Parameters for batch setApprovalForAll.
 */
export interface SetApprovalForAllBatchParams {
  /** Array of approval items. */
  approvals: ApprovalItem[];
  /** Use paymaster for gasless transactions. */
  usePaymaster?: boolean;
}

/**
 * Supported NFT marketplaces on Starknet.
 */
export type MarketplaceType = "aspect" | "unframed" | "flex" | "element" | "custom";

/**
 * Listing parameters for NFT marketplaces.
 */
export interface CreateListingParams {
  /** Collection contract address. */
  collection: string;
  /** Token ID to list. */
  tokenId: string | bigint;
  /** Listing price in STRK (wei). */
  price: bigint;
  /** Marketplace type. */
  marketplace: MarketplaceType;
  /** Custom marketplace address (if marketplace='custom'). */
  customAddress?: string;
}

/**
 * Listing information from marketplace.
 */
export interface MarketplaceListing {
  /** Listing ID. */
  listingId: string;
  /** Collection address. */
  collection: string;
  /** Token ID. */
  tokenId: string;
  /** Price in STRK (wei). */
  price: bigint;
  /** Seller address. */
  seller: string;
  /** Marketplace type. */
  marketplace: MarketplaceType;
  /** Is listing active. */
  isActive: boolean;
}

/**
 * Parameters for buying NFT from marketplace.
 */
export interface BuyNFTParams {
  /** Custom marketplace address (if marketplace='custom') */
  customAddress?: string;
  /** Marketplace listing ID. */
  marketplaceListingId: string;
  /** Collection address. */
  collection: string;
  /** Token ID. */
  tokenId: string | bigint;
  /** Price in STRK (wei). */
  price: bigint;
  /** Marketplace type. */
  marketplace: MarketplaceType;
}

// Extended buy params with custom address
export interface BuyNFTParamsExtended extends BuyNFTParams {
  customAddress?: string;
}

/**
 * Active marketplace type (element or flex).
 */
export type ActiveMarketplace = "element" | "flex";
