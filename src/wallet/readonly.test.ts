import { describe, it, expect } from "bun:test";
import {
  ReadonlyWallet,
  readonlyWallet,
  isReadonlyWallet,
  hasWalletAddress,
  isAddress,
} from "@/wallet/readonly";
import { fromAddress } from "@/types";

describe("ReadonlyWallet", () => {
  // Valid Starknet address (66 hex chars including 0x prefix)
  const testAddress = fromAddress(
    "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  );

  describe("constructor", () => {
    it("creates a readonly wallet with the given address", () => {
      const wallet = new ReadonlyWallet(testAddress);
      expect(wallet.address).toBe(testAddress);
    });

    it("accepts string addresses and normalizes them", () => {
      const addressString = "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      const wallet = new ReadonlyWallet(addressString);
      expect(wallet.address).toBe(testAddress);
    });
  });

  describe("readonlyWallet factory", () => {
    it("creates a ReadonlyWallet instance", () => {
      const wallet = readonlyWallet(testAddress);
      expect(wallet).toBeInstanceOf(ReadonlyWallet);
      expect(wallet.address).toBe(testAddress);
    });
  });

  describe("isReadonlyWallet type guard", () => {
    it("returns true for ReadonlyWallet instances", () => {
      const wallet = new ReadonlyWallet(testAddress);
      expect(isReadonlyWallet(wallet)).toBe(true);
    });

    it("returns true for objects with address property", () => {
      const walletLike = { address: testAddress };
      expect(isReadonlyWallet(walletLike)).toBe(true);
    });

    it("returns false for null", () => {
      expect(isReadonlyWallet(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isReadonlyWallet(undefined)).toBe(false);
    });

    it("returns false for objects without address", () => {
      expect(isReadonlyWallet({})).toBe(false);
    });

    it("returns false for primitives", () => {
      expect(isReadonlyWallet("string")).toBe(false);
      expect(isReadonlyWallet(123)).toBe(false);
      expect(isReadonlyWallet(true)).toBe(false);
    });
  });

  describe("hasWalletAddress type guard", () => {
    it("is an alias for isReadonlyWallet", () => {
      const wallet = new ReadonlyWallet(testAddress);
      expect(hasWalletAddress(wallet)).toBe(true);
      expect(hasWalletAddress({ address: testAddress })).toBe(true);
      expect(hasWalletAddress(null)).toBe(false);
    });
  });

  describe("isAddress type guard", () => {
    it("returns true for valid Starknet addresses", () => {
      expect(isAddress("0x123")).toBe(true);
      expect(isAddress("0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")).toBe(true);
    });

    it("returns false for strings without 0x prefix", () => {
      expect(isAddress("123456")).toBe(false);
    });

    it("returns false for strings with non-hex characters", () => {
      expect(isAddress("0xGGGG")).toBe(false);
      expect(isAddress("0xhello")).toBe(false);
    });

    it("returns false for non-strings", () => {
      expect(isAddress(123)).toBe(false);
      expect(isAddress(null)).toBe(false);
      expect(isAddress(undefined)).toBe(false);
    });

    it("returns false for addresses that are too long", () => {
      // 65+ hex chars after 0x is invalid
      const tooLong = "0x" + "0".repeat(65);
      expect(isAddress(tooLong)).toBe(false);
    });

    it("returns false for empty address", () => {
      expect(isAddress("0x")).toBe(false);
    });
  });

  describe("use with balanceOf", () => {
    it("exposes address property for balance query integration", () => {
      const wallet = new ReadonlyWallet(testAddress);
      // This test verifies the address property exists and is typed correctly.
      // Actual balance queries would require a connected provider.
      expect(wallet.address).toBe(testAddress);
    });
  });
});
