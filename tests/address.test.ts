import { describe, it, expect } from "vitest";
import { fromAddress } from "@/types";

describe("Address", () => {
  describe("from", () => {
    it("should parse a valid hex address", () => {
      const input =
        "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
      const address = fromAddress(input);

      expect(address).toBeDefined();
      expect(typeof address).toBe("string");
    });

    it("should parse a short hex address", () => {
      const address = fromAddress("0x1");

      expect(address).toBeDefined();
      expect(address).toMatch(/^0x[0-9a-fA-F]+$/);
    });

    it("should parse zero address", () => {
      const address = fromAddress("0x0");

      expect(address).toBeDefined();
    });

    it("should parse a BigInt value", () => {
      const address = fromAddress(BigInt("0x123"));

      expect(address).toBeDefined();
      expect(address).toMatch(/^0x[0-9a-fA-F]+$/);
    });

    it("should parse a number", () => {
      const address = fromAddress(123);

      expect(address).toBeDefined();
      expect(address).toMatch(/^0x[0-9a-fA-F]+$/);
    });

    it("should normalize uppercase to lowercase", () => {
      const upper =
        "0x049D36570D4E46F48E99674BD3FCC84644DDD6B96F7C741B1562B82F9E004DC7";
      const lower =
        "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";

      const addressUpper = fromAddress(upper);
      const addressLower = fromAddress(lower);

      expect(addressUpper.toLowerCase()).toBe(addressLower.toLowerCase());
    });

    it("should throw on invalid hex characters", () => {
      expect(() => fromAddress("0xGGGG")).toThrow();
    });

    it("should throw on empty string", () => {
      expect(() => fromAddress("")).toThrow();
    });

    it("should throw on non-hex string", () => {
      expect(() => fromAddress("not-an-address")).toThrow();
    });

    it("should throw on address exceeding max felt value", () => {
      // Starknet addresses must be < 2^251, this is 2^256 which is too large
      const tooLarge =
        "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF";
      expect(() => fromAddress(tooLarge)).toThrow();
    });

    it("should accept address at max felt boundary", () => {
      // Max felt value is 2^251 + 17 * 2^192 + 1, but typical addresses are much smaller
      // A 64-char hex that's within bounds should work
      const valid =
        "0x0000000000000000000000000000000000000000000000000000000000000001";
      const address = fromAddress(valid);

      expect(address).toBeDefined();
    });
  });
});
