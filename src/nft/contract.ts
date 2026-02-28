import { RpcProvider, type Call } from "starknet";
import type { Address } from "@/types";
import type {
  TokenId,
  NFTStandard,
  NFTContractInfo,
  NFTBalance,
  NFTOwner,
  NFTApproval,
  NFTMetadata,
} from "./types";
import { toCairoTokenId, fromCairoTokenId, fetchNFTMetadata } from "./utils";

/**
 * NFT Contract class for interacting with ERC721/ERC1155 contracts.
 */
export class NFTContract {
  readonly address: Address;
  readonly standard: NFTStandard;
  private readonly provider: RpcProvider;

  /**
   * Create a new NFTContract instance.
   *
   * @param address - Contract address
   * @param provider - RPC provider
   * @param standard - NFT standard (auto-detected if not provided)
   */
  constructor(address: Address, provider: RpcProvider, standard?: NFTStandard) {
    this.address = address;
    this.provider = provider;

    // Auto-detect standard if not provided
    this.standard = standard ?? "erc721";
  }

  /**
   * Internal helper to call contract.
   */
  private async call(
    entrypoint: string,
    calldata: string[] = []
  ): Promise<string[]> {
    return this.provider.callContract({
      contractAddress: this.address,
      entrypoint,
      calldata,
    });
  }

  /**
   * Get the token URI for a given token ID.
   */
  async getTokenURI(tokenId: TokenId): Promise<string> {
    const cairoId = toCairoTokenId(tokenId);

    try {
      if (this.standard === "erc1155") {
        const result = await this.call("uri", [...cairoId]);
        return result[0] || "";
      }

      const result = await this.call("token_uri", [...cairoId]);
      return result[0] || "";
    } catch {
      return "";
    }
  }

  /**
   * Fetch metadata for a token.
   */
  async getMetadata(tokenId: TokenId): Promise<NFTMetadata> {
    const uri = await this.getTokenURI(tokenId);

    if (!uri) {
      return { tokenId };
    }

    try {
      const data = await fetchNFTMetadata(uri);
      const metadata: NFTMetadata = {
        tokenId,
      };
      if (typeof data.name === "string") metadata.name = data.name;
      if (typeof data.description === "string")
        metadata.description = data.description;
      if (typeof data.image === "string") metadata.image = data.image;
      if (typeof data.external_url === "string")
        metadata.external_url = data.external_url;
      if (typeof data.animation_url === "string")
        metadata.animation_url = data.animation_url;
      if (Array.isArray(data.attributes)) {
        metadata.attributes = data.attributes as Array<{
          trait_type: string;
          value: string | number;
        }>;
      }
      metadata.rawUri = uri;
      return metadata;
    } catch {
      return { tokenId, rawUri: uri };
    }
  }

  /**
   * Get balance of an address.
   */
  async balanceOf(owner: Address): Promise<NFTBalance> {
    try {
      const result = await this.call("balanceOf", [owner]);

      if (result.length >= 2 && result[0] && result[1]) {
        return { balance: fromCairoTokenId(result[0], result[1]) };
      }

      return { balance: 0n };
    } catch {
      return { balance: 0n };
    }
  }

  /**
   * Get owner of a specific token.
   */
  async ownerOf(tokenId: TokenId): Promise<NFTOwner> {
    if (this.standard === "erc1155") {
      throw new Error("ownerOf not supported for ERC1155");
    }

    const cairoId = toCairoTokenId(tokenId);
    const result = await this.call("ownerOf", [...cairoId]);

    return { owner: result[0] as Address, confirmed: true };
  }

  /**
   * Check if an operator is approved for all tokens.
   */
  async isApprovedForAll(
    owner: Address,
    operator: Address
  ): Promise<NFTApproval> {
    const result = await this.call("isApprovedForAll", [owner, operator]);

    return { isApproved: result[0] === "0x1" };
  }

  /**
   * Get approved address for a specific token.
   */
  async getApproved(tokenId: TokenId): Promise<Address> {
    if (this.standard === "erc1155") {
      throw new Error("getApproved not supported for ERC1155");
    }

    const cairoId = toCairoTokenId(tokenId);
    const result = await this.call("getApproved", [...cairoId]);

    return result[0] as Address;
  }

  /**
   * Build transfer call.
   */
  buildTransferCall(
    from: Address,
    to: Address,
    tokenId: TokenId,
    amount: bigint = 1n
  ): Call {
    if (this.standard === "erc1155") {
      return {
        contractAddress: this.address,
        entrypoint: "safeTransferFrom",
        calldata: [
          from,
          to,
          ...toCairoTokenId(tokenId),
          ...toCairoTokenId(amount),
          0,
          0,
        ],
      };
    }

    return {
      contractAddress: this.address,
      entrypoint: "transferFrom",
      calldata: [from, to, ...toCairoTokenId(tokenId)],
    };
  }

  /**
   * Build safe transfer call.
   */
  buildSafeTransferCall(
    from: Address,
    to: Address,
    tokenId: TokenId,
    data: string[] = []
  ): Call {
    if (this.standard === "erc1155") {
      return {
        contractAddress: this.address,
        entrypoint: "safeTransferFrom",
        calldata: [
          from,
          to,
          ...toCairoTokenId(tokenId),
          ...toCairoTokenId(1n),
          data.length,
          ...data,
        ],
      };
    }

    return {
      contractAddress: this.address,
      entrypoint: "safeTransferFrom",
      calldata: [from, to, ...toCairoTokenId(tokenId), data.length, ...data],
    };
  }

  /**
   * Build approval call.
   */
  buildApproveCall(to: Address, tokenId: TokenId): Call {
    if (this.standard === "erc1155") {
      throw new Error(
        "approve not supported for ERC1155 - use setApprovalForAll"
      );
    }

    return {
      contractAddress: this.address,
      entrypoint: "approve",
      calldata: [to, ...toCairoTokenId(tokenId)],
    };
  }

  /**
   * Build setApprovalForAll call.
   */
  buildSetApprovalForAllCall(operator: Address, approved: boolean): Call {
    return {
      contractAddress: this.address,
      entrypoint: "setApprovalForAll",
      calldata: [operator, approved ? "1" : "0"],
    };
  }

  /**
   * Get contract information.
   */
  async getContractInfo(): Promise<NFTContractInfo> {
    let name = "Unknown";
    let symbol = "";

    try {
      if (this.standard !== "erc1155") {
        const nameResult = await this.call("name", []);
        name = nameResult[0] || "Unknown";

        const symbolResult = await this.call("symbol", []);
        symbol = symbolResult[0] || "";
      }
    } catch {
      // Ignore errors
    }

    return {
      address: this.address,
      standard: this.standard,
      name,
      symbol,
    };
  }
}

/**
 * Create NFT contract instance.
 */
export function createNFTContract(
  address: Address,
  provider: RpcProvider,
  standard?: NFTStandard
): NFTContract {
  return new NFTContract(address, provider, standard);
}
