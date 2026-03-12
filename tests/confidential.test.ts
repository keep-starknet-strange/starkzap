import { describe, expect, it, vi } from "vitest";
import type { Call } from "starknet";
import { TongoConfidential } from "@/confidential";
import type {
  ConfidentialFundDetails,
  ConfidentialTransferDetails,
  ConfidentialWithdrawDetails,
  ConfidentialRagequitDetails,
  ConfidentialRolloverDetails,
} from "@/confidential";
import { Amount } from "@/types/amount";

// ─── Mock tongo-sdk ─────────────────────────────────────────────────────────

const {
  approveCall,
  fundCall,
  transferCall,
  withdrawCall,
  ragequitCall,
  rolloverCall,
  mockTongoAccount,
  MockAccount,
} = vi.hoisted(() => {
  const approveCall: Call = {
    contractAddress: "0xTOKEN",
    entrypoint: "approve",
    calldata: ["0xTONGO", "0x64"],
  };
  const fundCall: Call = {
    contractAddress: "0xTONGO",
    entrypoint: "fund",
    calldata: ["0x1"],
  };
  const transferCall: Call = {
    contractAddress: "0xTONGO",
    entrypoint: "transfer",
    calldata: ["0x2"],
  };
  const withdrawCall: Call = {
    contractAddress: "0xTONGO",
    entrypoint: "withdraw",
    calldata: ["0x3"],
  };
  const ragequitCall: Call = {
    contractAddress: "0xTONGO",
    entrypoint: "ragequit",
    calldata: ["0x4"],
  };
  const rolloverCall: Call = {
    contractAddress: "0xTONGO",
    entrypoint: "rollover",
    calldata: ["0x5"],
  };

  const mockTongoAccount = {
    publicKey: { x: 42n, y: 99n },
    tongoAddress: vi.fn().mockReturnValue("mockBase58Address"),
    state: vi
      .fn()
      .mockResolvedValue({ balance: 100n, pending: 23n, nonce: 1n }),
    nonce: vi.fn().mockResolvedValue(1n),
    erc20ToTongo: vi.fn().mockResolvedValue(200n),
    tongoToErc20: vi.fn().mockResolvedValue(50n),
    fund: vi
      .fn()
      .mockResolvedValue({ approve: approveCall, toCalldata: () => fundCall }),
    transfer: vi.fn().mockResolvedValue({ toCalldata: () => transferCall }),
    withdraw: vi.fn().mockResolvedValue({ toCalldata: () => withdrawCall }),
    ragequit: vi.fn().mockResolvedValue({ toCalldata: () => ragequitCall }),
    rollover: vi.fn().mockResolvedValue({ toCalldata: () => rolloverCall }),
  };

  const MockAccount = vi.fn().mockImplementation(function () {
    return mockTongoAccount;
  });

  return {
    approveCall,
    fundCall,
    transferCall,
    withdrawCall,
    ragequitCall,
    rolloverCall,
    mockTongoAccount,
    MockAccount,
  };
});

vi.mock("@fatsolutions/tongo-sdk", () => ({
  Account: MockAccount,
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function createConfidential(): TongoConfidential {
  return new TongoConfidential({
    privateKey: 123n,
    contractAddress: "0xTONGO" as never,
    provider: {} as never,
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("TongoConfidential", () => {
  describe("constructor", () => {
    it("should create a TongoAccount with the provided config", () => {
      const c = createConfidential();
      expect(MockAccount).toHaveBeenCalledWith(123n, "0xTONGO", {});
      expect(c).toBeDefined();
    });
  });

  describe("address", () => {
    it("should delegate to account.tongoAddress()", () => {
      const c = createConfidential();
      expect(c.address).toBe("mockBase58Address");
      expect(mockTongoAccount.tongoAddress).toHaveBeenCalled();
    });
  });

  describe("recipientId", () => {
    it("should return the account public key", () => {
      const c = createConfidential();
      expect(c.recipientId).toEqual({ x: 42n, y: 99n });
    });
  });

  describe("getState", () => {
    it("should return decrypted state", async () => {
      const c = createConfidential();
      const state = await c.getState();
      expect(state).toEqual({ balance: 100n, pending: 23n, nonce: 1n });
      expect(mockTongoAccount.state).toHaveBeenCalled();
    });
  });

  describe("getNonce", () => {
    it("should return the account nonce", async () => {
      const c = createConfidential();
      const nonce = await c.getNonce();
      expect(nonce).toBe(1n);
      expect(mockTongoAccount.nonce).toHaveBeenCalled();
    });
  });

  describe("toConfidentialUnits", () => {
    it("should convert erc20 amount to confidential units", async () => {
      const c = createConfidential();
      const result = await c.toConfidentialUnits(Amount.fromRaw(1000n, 0));
      expect(result).toBe(200n);
      expect(mockTongoAccount.erc20ToTongo).toHaveBeenCalledWith(1000n);
    });
  });

  describe("toPublicUnits", () => {
    it("should convert confidential units to erc20 amount", async () => {
      const c = createConfidential();
      const result = await c.toPublicUnits(100n);
      expect(result).toBe(50n);
      expect(mockTongoAccount.tongoToErc20).toHaveBeenCalledWith(100n);
    });
  });

  describe("fund", () => {
    it("should return approve + fund calls from tongo account", async () => {
      const c = createConfidential();
      const details: ConfidentialFundDetails = {
        amount: Amount.fromRaw(100n, 0),
        sender: "0xSENDER" as never,
      };
      const calls = await c.fund(details);
      expect(calls).toEqual([approveCall, fundCall]);
      expect(mockTongoAccount.fund).toHaveBeenCalledWith({
        amount: 100n,
        sender: "0xSENDER",
      });
    });

    it("should omit approve call when not provided", async () => {
      mockTongoAccount.fund.mockResolvedValueOnce({
        approve: undefined,
        toCalldata: () => fundCall,
      });
      const c = createConfidential();
      const calls = await c.fund({
        amount: Amount.fromRaw(100n, 0),
        sender: "0xSENDER" as never,
      });
      expect(calls).toEqual([fundCall]);
    });

    it("should pass fee_to_sender when feeTo is set", async () => {
      mockTongoAccount.fund.mockClear();
      const c = createConfidential();
      const details: ConfidentialFundDetails = {
        amount: Amount.fromRaw(100n, 0),
        sender: "0xSENDER" as never,
        feeTo: 5n,
      };
      await c.fund(details);
      expect(mockTongoAccount.fund).toHaveBeenCalledWith({
        amount: 100n,
        sender: "0xSENDER",
        fee_to_sender: 5n,
      });
    });

    it("should omit fee_to_sender when feeTo is undefined", async () => {
      mockTongoAccount.fund.mockClear();
      const c = createConfidential();
      await c.fund({
        amount: Amount.fromRaw(100n, 0),
        sender: "0xSENDER" as never,
      });
      const callArgs = mockTongoAccount.fund.mock.calls[0]![0];
      expect(callArgs).not.toHaveProperty("fee_to_sender");
    });
  });

  describe("transfer", () => {
    it("should return transfer call with recipient pubkey", async () => {
      mockTongoAccount.transfer.mockClear();
      const c = createConfidential();
      const details: ConfidentialTransferDetails = {
        amount: Amount.fromRaw(50n, 0),
        to: { x: 1n, y: 2n },
        sender: "0xSENDER" as never,
      };
      const calls = await c.transfer(details);
      expect(calls).toEqual([transferCall]);
      expect(mockTongoAccount.transfer).toHaveBeenCalledWith({
        amount: 50n,
        to: { x: 1n, y: 2n },
        sender: "0xSENDER",
      });
    });

    it("should pass fee_to_sender when feeTo is set", async () => {
      mockTongoAccount.transfer.mockClear();
      const c = createConfidential();
      await c.transfer({
        amount: Amount.fromRaw(50n, 0),
        to: { x: 1n, y: 2n },
        sender: "0xSENDER" as never,
        feeTo: 3n,
      });
      expect(mockTongoAccount.transfer).toHaveBeenCalledWith({
        amount: 50n,
        to: { x: 1n, y: 2n },
        sender: "0xSENDER",
        fee_to_sender: 3n,
      });
    });
  });

  describe("withdraw", () => {
    it("should return withdraw call", async () => {
      mockTongoAccount.withdraw.mockClear();
      const c = createConfidential();
      const details: ConfidentialWithdrawDetails = {
        amount: Amount.fromRaw(25n, 0),
        to: "0xRECIPIENT" as never,
        sender: "0xSENDER" as never,
      };
      const calls = await c.withdraw(details);
      expect(calls).toEqual([withdrawCall]);
      expect(mockTongoAccount.withdraw).toHaveBeenCalledWith({
        amount: 25n,
        to: "0xRECIPIENT",
        sender: "0xSENDER",
      });
    });

    it("should pass fee_to_sender when feeTo is set", async () => {
      mockTongoAccount.withdraw.mockClear();
      const c = createConfidential();
      await c.withdraw({
        amount: Amount.fromRaw(25n, 0),
        to: "0xRECIPIENT" as never,
        sender: "0xSENDER" as never,
        feeTo: 2n,
      });
      expect(mockTongoAccount.withdraw).toHaveBeenCalledWith({
        amount: 25n,
        to: "0xRECIPIENT",
        sender: "0xSENDER",
        fee_to_sender: 2n,
      });
    });
  });

  describe("ragequit", () => {
    it("should return ragequit call", async () => {
      mockTongoAccount.ragequit.mockClear();
      const c = createConfidential();
      const details: ConfidentialRagequitDetails = {
        to: "0xRECIPIENT" as never,
        sender: "0xSENDER" as never,
      };
      const calls = await c.ragequit(details);
      expect(calls).toEqual([ragequitCall]);
      expect(mockTongoAccount.ragequit).toHaveBeenCalledWith({
        to: "0xRECIPIENT",
        sender: "0xSENDER",
      });
    });

    it("should pass fee_to_sender when feeTo is set", async () => {
      mockTongoAccount.ragequit.mockClear();
      const c = createConfidential();
      await c.ragequit({
        to: "0xRECIPIENT" as never,
        sender: "0xSENDER" as never,
        feeTo: 1n,
      });
      expect(mockTongoAccount.ragequit).toHaveBeenCalledWith({
        to: "0xRECIPIENT",
        sender: "0xSENDER",
        fee_to_sender: 1n,
      });
    });
  });

  describe("rollover", () => {
    it("should return rollover call", async () => {
      mockTongoAccount.rollover.mockClear();
      const c = createConfidential();
      const details: ConfidentialRolloverDetails = {
        sender: "0xSENDER" as never,
      };
      const calls = await c.rollover(details);
      expect(calls).toEqual([rolloverCall]);
      expect(mockTongoAccount.rollover).toHaveBeenCalledWith({
        sender: "0xSENDER",
      });
    });
  });

  describe("getTongoAccount", () => {
    it("should return the underlying tongo account", () => {
      const c = createConfidential();
      expect(c.getTongoAccount()).toBe(mockTongoAccount);
    });
  });
});
