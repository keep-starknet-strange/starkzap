import { describe, expect, it } from "vitest";
import {
  toCairoTokenId,
  fromCairoTokenId,
  resolveIPFS,
  buildERC721TransferCalldata,
  buildERC721SafeTransferCalldata,
  buildERC1155TransferCalldata,
  buildERC1155BatchTransferCalldata,
} from "@/nft/utils";
import type { TokenId } from "@/nft/types";

describe("NFT Utils - TokenId conversions", () => {
  it("converts bigint to Cairo Uint256", () => {
    const result = toCairoTokenId(123n);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("123");
    expect(result[1]).toBe("0");
  });

  it("converts large bigint to Cairo Uint256", () => {
    // Token ID = 2^64 (requires high part)
    const tokenId = 18446744073709551616n;
    const result = toCairoTokenId(tokenId);
    expect(result[0]).toBe("0");
    expect(result[1]).toBe("1");
  });

  it("converts string to Cairo Uint256", () => {
    const result = toCairoTokenId("456");
    expect(result).toEqual(["456", "0"]);
  });

  it("converts hex string to Cairo Uint256", () => {
    const result = toCairoTokenId("0x1");
    expect(result).toEqual(["1", "0"]);
  });

  it("converts number to Cairo Uint256", () => {
    const result = toCairoTokenId(789);
    expect(result).toEqual(["789", "0"]);
  });

  it("throws for negative bigint", () => {
    expect(() => toCairoTokenId(-1n)).toThrow("non-negative");
  });

  it("throws for negative number", () => {
    expect(() => toCairoTokenId(-5)).toThrow("non-negative integer");
  });

  it("converts Cairo Uint256 back to bigint", () => {
    const result = fromCairoTokenId("123", "0");
    expect(result).toBe(123n);
  });

  it("converts large Uint256 to bigint", () => {
    const result = fromCairoTokenId("0", "1");
    expect(result).toBe(18446744073709551616n);
  });

  it("converts Uint256 with defaults", () => {
    const result = fromCairoTokenId("456");
    expect(result).toBe(456n);
  });
});

describe("NFT Utils - IPFS resolution", () => {
  it("passes through HTTP URLs", () => {
    const url = "https://example.com/metadata.json";
    expect(resolveIPFS(url)).toBe(url);
  });

  it("converts ipfs:// to gateway", () => {
    const url = "ipfs://QmXxx";
    expect(resolveIPFS(url)).toBe("https://ipfs.io/ipfs/QmXxx");
  });

  it("converts ipfs: to gateway", () => {
    const url = "ipfs:QmXxx";
    expect(resolveIPFS(url)).toBe("https://ipfs.io/ipfs/QmXxx");
  });
});

describe("NFT Utils - ERC721 calldata", () => {
  it("builds ERC721 transfer calldata", () => {
    const call = buildERC721TransferCalldata("0xfrom", "0xto", 123n);

    expect(call.entrypoint).toBe("transferFrom");
    expect(call.contractAddress).toBe("");
    expect(call.calldata).toHaveLength(4);
  });

  it("builds ERC721 safe transfer calldata", () => {
    const call = buildERC721SafeTransferCalldata("0xfrom", "0xto", 456n, [
      "0xdata",
    ]);

    expect(call.entrypoint).toBe("safeTransferFrom");
    expect(call.calldata.length).toBeGreaterThan(4);
  });
});

describe("NFT Utils - ERC1155 calldata", () => {
  it("builds ERC1155 transfer calldata", () => {
    const call = buildERC1155TransferCalldata("0xfrom", "0xto", 123n, 5n);

    expect(call.entrypoint).toBe("safeTransferFrom");
    expect(call.calldata.length).toBeGreaterThan(4);
  });

  it("builds ERC1155 batch transfer calldata", () => {
    const call = buildERC1155BatchTransferCalldata("0xfrom", "0xto", [
      { tokenId: 1n, amount: 2n },
      { tokenId: 3n, amount: 4n },
    ]);

    expect(call.entrypoint).toBe("safeBatchTransferFrom");
  });
});

describe("NFT Types", () => {
  it("accepts bigint TokenId", () => {
    const tokenId: TokenId = 123n;
    expect(tokenId).toBe(123n);
  });

  it("accepts string TokenId", () => {
    const tokenId: TokenId = "123";
    expect(tokenId).toBe("123");
  });

  it("accepts hex string TokenId", () => {
    const tokenId: TokenId = "0x7b";
    expect(tokenId).toBe("0x7b");
  });
});

import { MARKETPLACE_CONFIG, getActiveMarketplace } from "@/nft/marketplace";

describe("NFT Marketplace - Configuration", () => {
  it("has element as active", () => {
    expect(MARKETPLACE_CONFIG.element.active).toBe(true);
  });

  it("has flex as active", () => {
    expect(MARKETPLACE_CONFIG.flex.active).toBe(true);
  });

  it("has aspect as inactive", () => {
    expect(MARKETPLACE_CONFIG.aspect.active).toBe(false);
  });

  it("has unframed as inactive", () => {
    expect(MARKETPLACE_CONFIG.unframed.active).toBe(false);
  });

  it("returns correct element address", () => {
    expect(MARKETPLACE_CONFIG.element.address).toBe("0x5816ab449ee30b9286ef7bea5f9faa38b87a3b9c7f225d14b4001c9273b6deb");
  });

  it("returns correct flex address", () => {
    expect(MARKETPLACE_CONFIG.flex.address).toBe("0x1c0c00f578944fc4cf22ebaf25c81bb25c9a2c1e3f69fb0e7e5d7341a46bddc");
  });

  it("getActiveMarketplace defaults to element", () => {
    delete process.env.ACTIVE_MARKETPLACE;
    expect(getActiveMarketplace()).toBe("element");
  });

  it("getActiveMarketplace uses env when set to flex", () => {
    process.env.ACTIVE_MARKETPLACE = "flex";
    expect(getActiveMarketplace()).toBe("flex");
  });

  it("getActiveMarketplace falls back to element for inactive marketplace", () => {
    process.env.ACTIVE_MARKETPLACE = "aspect";
    expect(getActiveMarketplace()).toBe("element");
  });
});
