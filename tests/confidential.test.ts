import { describe, expect, it, vi } from "vitest";
import type { Call } from "starknet";
import { Confidential } from "@/confidential";
import type {
  ConfidentialFundDetails,
  ConfidentialTransferDetails,
  ConfidentialWithdrawDetails,
  ConfidentialRagequitDetails,
  ConfidentialRolloverDetails,
} from "@/confidential";

// ─── Mock tongo-sdk ─────────────────────────────────────────────────────────

const {
  fundCall,
  transferCall,
  withdrawCall,
  ragequitCall,
  rolloverCall,
  mockTongoAccount,
  MockAccount,
} = vi.hoisted(() => {
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
    tongoAddress: vi.fn().mockReturnValue("mockBase58Address"),
    state: vi
      .fn()
      .mockResolvedValue({ balance: 100n, pending: 23n, nonce: 1n }),
    nonce: vi.fn().mockResolvedValue(1n),
    erc20ToTongo: vi.fn().mockResolvedValue(200n),
    tongoToErc20: vi.fn().mockResolvedValue(50n),
    fund: vi.fn().mockResolvedValue({ toCalldata: () => fundCall }),
    transfer: vi.fn().mockResolvedValue({ toCalldata: () => transferCall }),
    withdraw: vi.fn().mockResolvedValue({ toCalldata: () => withdrawCall }),
    ragequit: vi.fn().mockResolvedValue({ toCalldata: () => ragequitCall }),
    rollover: vi.fn().mockResolvedValue({ toCalldata: () => rolloverCall }),
  };

  const MockAccount = vi.fn().mockImplementation(function () {
    return mockTongoAccount;
  });

  return {
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

function createConfidential(): Confidential {
  return new Confidential({
    privateKey: 123n,
    contractAddress: "0xTONGO" as never,
    provider: {} as never,
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Confidential", () => {
  describe("constructor", () => {
    it("should create a TongoAccount with the provided config", () => {
      const c = createConfidential();
      expect(MockAccount).toHaveBeenCalledWith(123n, "0xTONGO", {});
      expect(c).toBeDefined();
    });
  });

  describe("tongoAddress", () => {
    it("should delegate to account.tongoAddress()", () => {
      const c = createConfidential();
      expect(c.tongoAddress).toBe("mockBase58Address");
      expect(mockTongoAccount.tongoAddress).toHaveBeenCalled();
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

  describe("erc20ToTongo", () => {
    it("should convert erc20 amount to tongo units", async () => {
      const c = createConfidential();
      const result = await c.erc20ToTongo(1000n);
      expect(result).toBe(200n);
      expect(mockTongoAccount.erc20ToTongo).toHaveBeenCalledWith(1000n);
    });
  });

  describe("tongoToErc20", () => {
    it("should convert tongo amount to erc20 units", async () => {
      const c = createConfidential();
      const result = await c.tongoToErc20(100n);
      expect(result).toBe(50n);
      expect(mockTongoAccount.tongoToErc20).toHaveBeenCalledWith(100n);
    });
  });

  describe("populateFund", () => {
    it("should return fund call from tongo account", async () => {
      const c = createConfidential();
      const details: ConfidentialFundDetails = {
        amount: 100n,
        sender: "0xSENDER" as never,
      };
      const calls = await c.populateFund(details);
      expect(calls).toEqual([fundCall]);
      expect(mockTongoAccount.fund).toHaveBeenCalledWith({
        amount: 100n,
        sender: "0xSENDER",
      });
    });

    it("should pass fee_to_sender when feeTo is set", async () => {
      mockTongoAccount.fund.mockClear();
      const c = createConfidential();
      const details: ConfidentialFundDetails = {
        amount: 100n,
        sender: "0xSENDER" as never,
        feeTo: 5n,
      };
      await c.populateFund(details);
      expect(mockTongoAccount.fund).toHaveBeenCalledWith({
        amount: 100n,
        sender: "0xSENDER",
        fee_to_sender: 5n,
      });
    });

    it("should omit fee_to_sender when feeTo is undefined", async () => {
      mockTongoAccount.fund.mockClear();
      const c = createConfidential();
      await c.populateFund({
        amount: 100n,
        sender: "0xSENDER" as never,
      });
      const callArgs = mockTongoAccount.fund.mock.calls[0]![0];
      expect(callArgs).not.toHaveProperty("fee_to_sender");
    });
  });

  describe("populateTransfer", () => {
    it("should return transfer call with recipient pubkey", async () => {
      mockTongoAccount.transfer.mockClear();
      const c = createConfidential();
      const details: ConfidentialTransferDetails = {
        amount: 50n,
        to: { x: 1n, y: 2n },
        sender: "0xSENDER" as never,
      };
      const calls = await c.populateTransfer(details);
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
      await c.populateTransfer({
        amount: 50n,
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

  describe("populateWithdraw", () => {
    it("should return withdraw call", async () => {
      mockTongoAccount.withdraw.mockClear();
      const c = createConfidential();
      const details: ConfidentialWithdrawDetails = {
        amount: 25n,
        to: "0xRECIPIENT" as never,
        sender: "0xSENDER" as never,
      };
      const calls = await c.populateWithdraw(details);
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
      await c.populateWithdraw({
        amount: 25n,
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

  describe("populateRagequit", () => {
    it("should return ragequit call", async () => {
      mockTongoAccount.ragequit.mockClear();
      const c = createConfidential();
      const details: ConfidentialRagequitDetails = {
        to: "0xRECIPIENT" as never,
        sender: "0xSENDER" as never,
      };
      const calls = await c.populateRagequit(details);
      expect(calls).toEqual([ragequitCall]);
      expect(mockTongoAccount.ragequit).toHaveBeenCalledWith({
        to: "0xRECIPIENT",
        sender: "0xSENDER",
      });
    });

    it("should pass fee_to_sender when feeTo is set", async () => {
      mockTongoAccount.ragequit.mockClear();
      const c = createConfidential();
      await c.populateRagequit({
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

  describe("populateRollover", () => {
    it("should return rollover call", async () => {
      mockTongoAccount.rollover.mockClear();
      const c = createConfidential();
      const details: ConfidentialRolloverDetails = {
        sender: "0xSENDER" as never,
      };
      const calls = await c.populateRollover(details);
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
