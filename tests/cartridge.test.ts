import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the @cartridge/controller module
vi.mock("@cartridge/controller", () => {
  const mockAccount = {
    address: "0x1234567890abcdef",
    signer: {
      signTransaction: vi.fn().mockResolvedValue(["0xsig1", "0xsig2"]),
      signMessage: vi.fn().mockResolvedValue(["0xmsg1", "0xmsg2"]),
    },
    signMessage: vi.fn().mockResolvedValue(["0xmsg1", "0xmsg2"]),
  };

  class MockController {
    probe = vi.fn().mockResolvedValue(null);
    connect = vi.fn().mockResolvedValue(mockAccount);
    disconnect = vi.fn().mockResolvedValue(undefined);
    openProfile = vi.fn();
    openSettings = vi.fn();
    username = vi.fn().mockResolvedValue("testuser");
  }

  return { default: MockController };
});

import { CartridgeSigner } from "../src/signer/cartridge.js";

describe("CartridgeSigner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("create", () => {
    it("should create and connect a CartridgeSigner", async () => {
      const signer = await CartridgeSigner.create({
        rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
      });

      expect(signer).toBeInstanceOf(CartridgeSigner);
      expect(signer.isConnected()).toBe(true);
    });

    it("should accept policies option", async () => {
      const signer = await CartridgeSigner.create({
        policies: [{ target: "0xCONTRACT", method: "transfer" }],
      });

      expect(signer.isConnected()).toBe(true);
    });

    it("should work with no options", async () => {
      const signer = await CartridgeSigner.create();

      expect(signer.isConnected()).toBe(true);
    });
  });

  describe("connect", () => {
    it("should use existing session if available", async () => {
      // First create a signer
      const signer = await CartridgeSigner.create();
      const controller = signer.getController();

      // Mock probe to return an existing account
      const mockExistingAccount = {
        address: "0xexisting",
        signer: { signTransaction: vi.fn(), signMessage: vi.fn() },
        signMessage: vi.fn(),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (controller.probe as any).mockResolvedValueOnce(mockExistingAccount);

      // Reconnect should use probe
      const account = await signer.connect();
      expect(account.address).toBe("0xexisting");
    });

    it("should throw if connection fails", async () => {
      const signer = await CartridgeSigner.create();
      const controller = signer.getController();

      // Mock probe and connect to return null (cancelled)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (controller.probe as any).mockResolvedValueOnce(null);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (controller.connect as any).mockResolvedValueOnce(null);

      await expect(signer.connect()).rejects.toThrow(
        "Cartridge connection cancelled or failed"
      );
    });
  });

  describe("getPubKey", () => {
    it("should return the account address", async () => {
      const signer = await CartridgeSigner.create();
      const pubKey = await signer.getPubKey();

      expect(pubKey).toBe("0x1234567890abcdef");
    });
  });

  describe("getAccount", () => {
    it("should return the connected wallet account", async () => {
      const signer = await CartridgeSigner.create();
      const account = signer.getAccount();

      expect(account.address).toBe("0x1234567890abcdef");
    });
  });

  describe("signMessage", () => {
    it("should delegate to wallet account", async () => {
      const signer = await CartridgeSigner.create();
      const typedData = {
        types: {
          StarknetDomain: [{ name: "name", type: "felt" }],
          Message: [{ name: "content", type: "felt" }],
        },
        primaryType: "Message" as const,
        domain: { name: "Test" },
        message: { content: "0x1234" },
      };

      const signature = await signer.signMessage(typedData, "0xaccount");

      expect(signature).toEqual(["0xmsg1", "0xmsg2"]);
    });
  });

  describe("signTransaction", () => {
    it("should delegate to wallet account signer", async () => {
      const signer = await CartridgeSigner.create();
      const calls = [
        {
          contractAddress: "0x123",
          entrypoint: "transfer",
          calldata: ["0x456", "100"],
        },
      ];

      const signature = await signer.signTransaction(calls, {
        walletAddress: "0xaccount",
        chainId: "0x534e5f5345504f4c4941" as const,
        nonce: 0n,
        version: "0x3" as const,
        maxFee: 0n,
        cairoVersion: "1" as const,
      });

      expect(signature).toEqual(["0xsig1", "0xsig2"]);
    });
  });

  describe("_getStarknetSigner", () => {
    it("should return the underlying signer", async () => {
      const signer = await CartridgeSigner.create();
      const starknetSigner = signer._getStarknetSigner();

      expect(starknetSigner).toBeDefined();
      expect(typeof starknetSigner.signTransaction).toBe("function");
    });
  });

  describe("getController", () => {
    it("should return the Cartridge Controller instance", async () => {
      const signer = await CartridgeSigner.create();
      const controller = signer.getController();

      expect(controller).toBeDefined();
      expect(typeof controller.openProfile).toBe("function");
    });
  });

  describe("disconnect", () => {
    it("should disconnect and clear account", async () => {
      const signer = await CartridgeSigner.create();
      expect(signer.isConnected()).toBe(true);

      await signer.disconnect();
      expect(signer.isConnected()).toBe(false);
    });

    it("should throw when accessing account after disconnect", async () => {
      const signer = await CartridgeSigner.create();
      await signer.disconnect();

      expect(() => signer.getAccount()).toThrow("Cartridge not connected");
    });
  });
});
