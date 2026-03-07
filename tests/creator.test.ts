import { describe, it, expect } from "vitest";
import { Creator } from "@/creator";
import type { Token, Address } from "@/types";

// Mock tokens for testing
const STRK: Token = {
  name: "Starknet",
  address:
    "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d" as Address,
  decimals: 18,
  symbol: "STRK",
};

const USDC: Token = {
  name: "USDC",
  address:
    "0x033068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb" as Address,
  decimals: 6,
  symbol: "USDC",
};

const CREATOR_ADDRESS =
  "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Address;

describe("Creator", () => {
  describe("constructor", () => {
    it("should create a Creator with minimal config", () => {
      const creator = new Creator({ address: CREATOR_ADDRESS });

      expect(creator.address).toBe(CREATOR_ADDRESS);
      expect(creator.displayName).toBe("Anonymous Creator");
      expect(creator.tokens).toEqual([]);
    });

    it("should create a Creator with full config", () => {
      const creator = new Creator({
        address: CREATOR_ADDRESS,
        displayName: "Test Creator",
        tokens: [STRK, USDC],
        avatarUrl: "https://example.com/avatar.png",
        bio: "Test bio",
      });

      expect(creator.address).toBe(CREATOR_ADDRESS);
      expect(creator.displayName).toBe("Test Creator");
      expect(creator.tokens).toEqual([STRK, USDC]);
      expect(creator.avatarUrl).toBe("https://example.com/avatar.png");
      expect(creator.bio).toBe("Test bio");
    });
  });

  describe("fromAddress", () => {
    it("should create a Creator from just an address", () => {
      const creator = Creator.fromAddress(CREATOR_ADDRESS);

      expect(creator.address).toBe(CREATOR_ADDRESS);
      expect(creator.displayName).toBe("Anonymous Creator");
    });
  });

  describe("createTipLink", () => {
    it("should create a tip link with defaults", () => {
      const creator = new Creator({
        address: CREATOR_ADDRESS,
        displayName: "Test Creator",
      });

      const result = creator.createTipLink();

      expect(result.url).toContain("https://tip.starkzap.io/");
      expect(result.url).toContain(CREATOR_ADDRESS);
      expect(result.url).toContain("amount=5");
      expect(result.url).toContain("theme=dark");
    });

    it("should create a tip link with custom options", () => {
      const creator = new Creator({
        address: CREATOR_ADDRESS,
        displayName: "Test Creator",
      });

      const result = creator.createTipLink({
        suggestedAmount: "10",
        token: STRK,
        message: "Buy me a coffee",
        theme: "light",
      });

      expect(result.url).toContain("amount=10");
      expect(result.url).toContain("token=STRK");
      expect(result.url).toContain("theme=light");
      // Message is encoded in the URL
      expect(result.url).toContain("message=");
    });
  });

  describe("tipButton", () => {
    it("should generate tip button HTML with defaults", () => {
      const creator = new Creator({
        address: CREATOR_ADDRESS,
        displayName: "Test Creator",
      });

      const result = creator.tipButton();

      expect(result.html).toBeDefined();
      expect(result.script).toBeDefined();
      expect(result.styles).toBeDefined();
      expect(result.html).toContain("starkzap-tip-container");
      expect(result.html).toContain("Tip Test Creator");
      expect(result.html).toContain(CREATOR_ADDRESS);
    });

    it("should generate tip button with custom options", () => {
      const creator = new Creator({
        address: CREATOR_ADDRESS,
        displayName: "Test Creator",
      });

      const result = creator.tipButton({
        suggestedTips: ["1", "5", "10", "25"],
        theme: "light",
        buttonText: "Support",
        allowCustomAmount: false,
      });

      expect(result.html).toContain("Support");
      expect(result.styles).toContain("#ffffff"); // light background
      expect(result.html).toContain('data-amount="1"');
      expect(result.html).toContain('data-amount="25"');
      expect(result.html).not.toContain("starkzap-tip-custom-input");
    });

    it("should generate unique button IDs", () => {
      const creator = new Creator({ address: CREATOR_ADDRESS });

      const result1 = creator.tipButton();
      const result2 = creator.tipButton();

      const id1 = result1.html.match(/id="([^"]+)"/)?.[1];
      const id2 = result2.html.match(/id="([^"]+)"/)?.[1];

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
    });
  });

  describe("getStats", () => {
    it("should return placeholder stats", async () => {
      const creator = new Creator({ address: CREATOR_ADDRESS });

      const stats = await creator.getStats();

      expect(stats).toEqual({
        totalTipsReceived: {},
        uniqueTippers: 0,
        totalTipsCount: 0,
      });
    });
  });
});
