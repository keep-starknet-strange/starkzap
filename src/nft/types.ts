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
