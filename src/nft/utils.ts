import { CallData, type Call } from "starknet";
import type { TokenId } from "./types";

/**
 * Convert TokenId to Cairo Uint256 format.
 *
 * @param tokenId - Token ID as bigint, string, or number
 * @returns Cairo Uint256 calldata [low, high]
 */
export function toCairoTokenId(tokenId: TokenId): [string, string] {
  if (typeof tokenId === "bigint") {
    if (tokenId < 0n) {
      throw new Error("Token ID must be non-negative");
    }
    // Uint256 is two 64-bit parts (felt)
    const low = tokenId & 0xffffffffffffffffn; // 2^64 - 1
    const high = tokenId >> 64n;
    return [low.toString(), high.toString()];
  }

  if (typeof tokenId === "number") {
    if (tokenId < 0 || !Number.isInteger(tokenId)) {
      throw new Error("Token ID must be a non-negative integer");
    }
    return toCairoTokenId(BigInt(tokenId));
  }

  // Parse string - could be hex or decimal
  const parsed = BigInt(tokenId);
  return toCairoTokenId(parsed);
}

/**
 * Convert Cairo Uint256 to TokenId (bigint).
 *
 * @param low - Low part of Uint256 (64-bit)
 * @param high - High part of Uint256 (64-bit)
 * @returns Token ID as bigint
 */
export function fromCairoTokenId(
  low: string | bigint,
  high: string | bigint = "0"
): bigint {
  const lowBig = typeof low === "bigint" ? low : BigInt(low);
  const highBig = typeof high === "bigint" ? high : BigInt(high);
  return (highBig << 64n) + lowBig;
}

/**
 * Convert TokenId to Cairo felt (for single felt).
 *
 * @param tokenId - Token ID
 * @returns Token ID as felt string
 */
export function toFeltTokenId(tokenId: TokenId): string {
  if (typeof tokenId === "bigint") {
    if (tokenId < 0n) {
      throw new Error("Token ID must be non-negative");
    }
    if (tokenId > 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffn) {
      throw new Error("Token ID too large for felt");
    }
    return tokenId.toString();
  }

  if (typeof tokenId === "number") {
    return toFeltTokenId(BigInt(tokenId));
  }

  const parsed = BigInt(tokenId);
  return toFeltTokenId(parsed);
}

/**
 * Build ERC721 transfer calldata.
 */
export function buildERC721TransferCalldata(
  from: string,
  to: string,
  tokenId: TokenId
): Call {
  return {
    contractAddress: "", // Set by caller
    entrypoint: "transferFrom",
    calldata: CallData.compile([from, to, ...toCairoTokenId(tokenId)]),
  };
}

/**
 * Build ERC721 safe transfer calldata.
 */
export function buildERC721SafeTransferCalldata(
  from: string,
  to: string,
  tokenId: TokenId,
  data: string[] = []
): Call {
  return {
    contractAddress: "", // Set by caller
    entrypoint: "safeTransferFrom",
    calldata: CallData.compile([
      from,
      to,
      ...toCairoTokenId(tokenId),
      data.length,
      ...data,
    ]),
  };
}

/**
 * Build ERC1155 transfer calldata.
 */
export function buildERC1155TransferCalldata(
  from: string,
  to: string,
  tokenId: TokenId,
  amount: bigint = 1n,
  data: string[] = []
): Call {
  return {
    contractAddress: "", // Set by caller
    entrypoint: "safeTransferFrom",
    calldata: CallData.compile([
      from,
      to,
      ...toCairoTokenId(tokenId),
      ...toCairoTokenId(amount),
      data.length,
      ...data,
    ]),
  };
}

/**
 * Build ERC1155 batch transfer calldata.
 */
export function buildERC1155BatchTransferCalldata(
  from: string,
  to: string,
  transfers: Array<{ tokenId: TokenId; amount: bigint }>,
  data: string[] = []
): Call {
  const tokenIds = transfers.map((t) => toCairoTokenId(t.tokenId)).flat();
  const amounts = transfers.map((t) => toCairoTokenId(t.amount)).flat();

  return {
    contractAddress: "", // Set by caller
    entrypoint: "safeBatchTransferFrom",
    calldata: CallData.compile([
      from,
      to,
      transfers.length,
      ...tokenIds,
      transfers.length,
      ...amounts,
      data.length,
      ...data,
    ]),
  };
}

/**
 * Resolve IPFS URI to HTTP URL.
 *
 * @param uri - IPFS or HTTP URI
 * @returns HTTP URL
 */
export function resolveIPFS(uri: string): string {
  if (uri.startsWith("ipfs://")) {
    const ipfsPath = uri.replace("ipfs://", "");
    return `https://ipfs.io/ipfs/${ipfsPath}`;
  }
  if (uri.startsWith("ipfs:")) {
    const ipfsPath = uri.replace("ipfs:", "");
    return `https://ipfs.io/ipfs/${ipfsPath}`;
  }
  return uri;
}

/**
 * Fetch and parse NFT metadata from URI.
 *
 * @param uri - Token URI from contract
 * @returns Parsed metadata
 */
export async function fetchNFTMetadata(
  uri: string
): Promise<Record<string, unknown>> {
  const url = resolveIPFS(uri);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch metadata: ${response.statusText}`);
  }

  return response.json();
}
