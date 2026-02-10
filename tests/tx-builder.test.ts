import { describe, expect, it, vi } from "vitest";
import { type Address, fromAddress, type Token } from "@/types";
import { Amount } from "@/types";
import { TxBuilder } from "@/tx/builder";
import { Erc20 } from "@/erc20";
import type { WalletInterface } from "@/wallet/interface";
import type { Call } from "starknet";
import type { Staking } from "@/staking";

// ─── Test fixtures ───────────────────────────────────────────────────────────

const mockUSDC: Token = {
  name: "USD Coin",
  address:
    "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8" as Address,
  decimals: 6,
  symbol: "USDC",
};

const mockSTRK: Token = {
  name: "Starknet Token",
  address:
    "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d" as Address,
  decimals: 18,
  symbol: "STRK",
};

const alice = fromAddress("0xA11CE");
const bob = fromAddress("0xB0B");
const poolAddress = fromAddress("0x1001");
const dexAddress = fromAddress("0xDE3");

const rawCall: Call = {
  contractAddress: "0x123",
  entrypoint: "do_something",
  calldata: [1, 2, 3],
};

const approveCall: Call = {
  contractAddress: mockSTRK.address,
  entrypoint: "approve",
  calldata: ["0xspender", "100", "0"],
};

const enterPoolCall: Call = {
  contractAddress: poolAddress,
  entrypoint: "enter_delegation_pool",
  calldata: ["0xwallet", "100", "0"],
};

const claimCall: Call = {
  contractAddress: poolAddress,
  entrypoint: "claim_rewards",
  calldata: ["0xwallet"],
};

const exitIntentCall: Call = {
  contractAddress: poolAddress,
  entrypoint: "exit_delegation_pool_intent",
  calldata: ["50", "0"],
};

const exitCall: Call = {
  contractAddress: poolAddress,
  entrypoint: "exit_delegation_pool_action",
  calldata: ["0xwallet"],
};

// ─── Mock helpers ────────────────────────────────────────────────────────────

function createMockErc20(token: Token) {
  return {
    populateApprove: vi.fn().mockReturnValue({
      contractAddress: token.address,
      entrypoint: "approve",
      calldata: ["0xspender", "100", "0"],
    }),
    populateTransfer: vi.fn().mockImplementation((transfers: unknown[]) =>
      transfers.map(() => ({
        contractAddress: token.address,
        entrypoint: "transfer",
        calldata: ["0xto", "100", "0"],
      }))
    ),
  } as unknown as Erc20;
}

function createMockStaking() {
  return {
    poolAddress,
    populateEnter: vi.fn().mockReturnValue([approveCall, enterPoolCall]),
    populateAdd: vi.fn().mockReturnValue([approveCall, enterPoolCall]),
    populateClaimRewards: vi.fn().mockReturnValue(claimCall),
    populateExitIntent: vi.fn().mockReturnValue(exitIntentCall),
    populateExit: vi.fn().mockReturnValue(exitCall),
  } as unknown as Staking;
}

function createMockWallet(
  overrides: Partial<WalletInterface> = {}
): WalletInterface {
  const mockErc20Map = new Map<Address, Erc20>();
  const mockStaking = createMockStaking();

  return {
    address: fromAddress("0x0A11E7"),
    erc20: vi.fn().mockImplementation((token: Token) => {
      let erc20 = mockErc20Map.get(token.address);
      if (!erc20) {
        erc20 = createMockErc20(token);
        mockErc20Map.set(token.address, erc20);
      }
      return erc20;
    }),
    staking: vi.fn().mockResolvedValue(mockStaking),
    execute: vi.fn().mockResolvedValue({ hash: "0xtxhash" }),
    estimateFee: vi.fn().mockResolvedValue({ overall_fee: 1000n }),
    ...overrides,
  } as unknown as WalletInterface;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("TxBuilder", () => {
  // ============================================================
  // Construction & chaining
  // ============================================================

  describe("chaining", () => {
    it("should return the same builder instance from every method", () => {
      const wallet = createMockWallet();
      const builder = new TxBuilder(wallet);

      const amount = Amount.parse("100", mockUSDC);

      expect(builder.add(rawCall)).toBe(builder);
      expect(builder.approve(mockUSDC, dexAddress, amount)).toBe(builder);
      expect(builder.transfer(mockUSDC, { to: alice, amount })).toBe(builder);
      expect(builder.enterPool(poolAddress, amount)).toBe(builder);
      expect(builder.addToPool(poolAddress, amount)).toBe(builder);
      expect(builder.claimPoolRewards(poolAddress)).toBe(builder);
      expect(builder.exitPoolIntent(poolAddress, amount)).toBe(builder);
      expect(builder.exitPool(poolAddress)).toBe(builder);
    });
  });

  // ============================================================
  // Raw calls
  // ============================================================

  describe("add", () => {
    it("should include raw calls in the output", async () => {
      const wallet = createMockWallet();
      const calls = await new TxBuilder(wallet).add(rawCall).calls();

      expect(calls).toEqual([rawCall]);
    });

    it("should support multiple raw calls in one add", async () => {
      const wallet = createMockWallet();
      const call2: Call = { ...rawCall, entrypoint: "other" };
      const calls = await new TxBuilder(wallet).add(rawCall, call2).calls();

      expect(calls).toEqual([rawCall, call2]);
    });
  });

  // ============================================================
  // ERC20 operations
  // ============================================================

  describe("approve", () => {
    it("should build an approve call via erc20", async () => {
      const wallet = createMockWallet();
      const amount = Amount.parse("100", mockUSDC);

      const calls = await new TxBuilder(wallet)
        .approve(mockUSDC, dexAddress, amount)
        .calls();

      expect(calls).toHaveLength(1);
      expect(calls[0].entrypoint).toBe("approve");
      expect(wallet.erc20).toHaveBeenCalledWith(mockUSDC);
    });
  });

  describe("transfer", () => {
    it("should accept a single transfer object", async () => {
      const wallet = createMockWallet();
      const amount = Amount.parse("50", mockUSDC);

      const calls = await new TxBuilder(wallet)
        .transfer(mockUSDC, { to: alice, amount })
        .calls();

      expect(calls).toHaveLength(1);
      expect(calls[0].entrypoint).toBe("transfer");

      const erc20 = wallet.erc20(mockUSDC);
      expect(erc20.populateTransfer).toHaveBeenCalledWith([
        { to: alice, amount },
      ]);
    });

    it("should accept an array of transfers", async () => {
      const wallet = createMockWallet();
      const amount1 = Amount.parse("50", mockUSDC);
      const amount2 = Amount.parse("25", mockUSDC);

      const calls = await new TxBuilder(wallet)
        .transfer(mockUSDC, [
          { to: alice, amount: amount1 },
          { to: bob, amount: amount2 },
        ])
        .calls();

      expect(calls).toHaveLength(2);
    });
  });

  // ============================================================
  // Staking operations
  // ============================================================

  describe("enterPool", () => {
    it("should resolve staking and build enter calls", async () => {
      const wallet = createMockWallet();
      const amount = Amount.parse("100", mockSTRK);

      const calls = await new TxBuilder(wallet)
        .enterPool(poolAddress, amount)
        .calls();

      expect(wallet.staking).toHaveBeenCalledWith(poolAddress);
      // populateEnter returns [approveCall, enterPoolCall]
      expect(calls).toHaveLength(2);
      expect(calls[0].entrypoint).toBe("approve");
      expect(calls[1].entrypoint).toBe("enter_delegation_pool");
    });
  });

  describe("addToPool", () => {
    it("should resolve staking and build add calls", async () => {
      const wallet = createMockWallet();
      const amount = Amount.parse("50", mockSTRK);

      const calls = await new TxBuilder(wallet)
        .addToPool(poolAddress, amount)
        .calls();

      expect(wallet.staking).toHaveBeenCalledWith(poolAddress);
      expect(calls).toHaveLength(2);
    });
  });

  describe("claimPoolRewards", () => {
    it("should resolve staking and build claim call", async () => {
      const wallet = createMockWallet();

      const calls = await new TxBuilder(wallet)
        .claimPoolRewards(poolAddress)
        .calls();

      expect(calls).toHaveLength(1);
      expect(calls[0].entrypoint).toBe("claim_rewards");
    });
  });

  describe("exitPoolIntent", () => {
    it("should resolve staking and build exit intent call", async () => {
      const wallet = createMockWallet();
      const amount = Amount.parse("50", mockSTRK);

      const calls = await new TxBuilder(wallet)
        .exitPoolIntent(poolAddress, amount)
        .calls();

      expect(calls).toHaveLength(1);
      expect(calls[0].entrypoint).toBe("exit_delegation_pool_intent");
    });
  });

  describe("exitPool", () => {
    it("should resolve staking and build exit call", async () => {
      const wallet = createMockWallet();

      const calls = await new TxBuilder(wallet).exitPool(poolAddress).calls();

      expect(calls).toHaveLength(1);
      expect(calls[0].entrypoint).toBe("exit_delegation_pool_action");
    });
  });

  // ============================================================
  // Batching & ordering
  // ============================================================

  describe("batching", () => {
    it("should preserve call order across mixed operations", async () => {
      const wallet = createMockWallet();
      const amount = Amount.parse("100", mockUSDC);

      const calls = await new TxBuilder(wallet)
        .add(rawCall)
        .approve(mockUSDC, dexAddress, amount)
        .transfer(mockUSDC, { to: alice, amount })
        .enterPool(poolAddress, amount)
        .calls();

      expect(calls).toHaveLength(5);
      // raw call first
      expect(calls[0]).toEqual(rawCall);
      // approve second
      expect(calls[1].entrypoint).toBe("approve");
      // transfer third
      expect(calls[2].entrypoint).toBe("transfer");
      // staking approve + enter last
      expect(calls[3].entrypoint).toBe("approve");
      expect(calls[4].entrypoint).toBe("enter_delegation_pool");
    });

    it("should handle multiple staking operations in parallel", async () => {
      const pool2 = fromAddress("0x1002");
      const mockStaking2 = createMockStaking();
      const wallet = createMockWallet({
        staking: vi
          .fn()
          .mockResolvedValueOnce(createMockStaking())
          .mockResolvedValueOnce(mockStaking2),
      });
      const amount = Amount.parse("100", mockSTRK);

      const calls = await new TxBuilder(wallet)
        .enterPool(poolAddress, amount)
        .enterPool(pool2, amount)
        .calls();

      // Both should resolve (2 calls each = 4 total)
      expect(calls).toHaveLength(4);
      // wallet.staking called for both pools
      expect(wallet.staking).toHaveBeenCalledTimes(2);
    });
  });

  // ============================================================
  // Terminal operations
  // ============================================================

  describe("calls", () => {
    it("should return empty array when no operations added", async () => {
      const wallet = createMockWallet();
      const calls = await new TxBuilder(wallet).calls();

      expect(calls).toEqual([]);
    });
  });

  describe("estimateFee", () => {
    it("should delegate to wallet.estimateFee with resolved calls", async () => {
      const wallet = createMockWallet();

      await new TxBuilder(wallet).add(rawCall).estimateFee();

      expect(wallet.estimateFee).toHaveBeenCalledWith([rawCall]);
    });
  });

  describe("send", () => {
    it("should execute all collected calls via wallet.execute", async () => {
      const wallet = createMockWallet();
      const amount = Amount.parse("100", mockUSDC);

      const tx = await new TxBuilder(wallet)
        .add(rawCall)
        .transfer(mockUSDC, { to: alice, amount })
        .send();

      expect(wallet.execute).toHaveBeenCalledTimes(1);
      const executedCalls = (wallet.execute as ReturnType<typeof vi.fn>).mock
        .calls[0]![0] as Call[];
      expect(executedCalls).toHaveLength(2);
      expect(tx).toEqual({ hash: "0xtxhash" });
    });

    it("should pass execute options through", async () => {
      const wallet = createMockWallet();
      const options = { feeMode: "sponsored" as const };

      await new TxBuilder(wallet).add(rawCall).send(options);

      expect(wallet.execute).toHaveBeenCalledWith(expect.any(Array), options);
    });

    it("should throw when called with no operations", async () => {
      const wallet = createMockWallet();

      await expect(new TxBuilder(wallet).send()).rejects.toThrow(
        "No calls to execute"
      );
    });

    it("should throw on double send", async () => {
      const wallet = createMockWallet();
      const builder = new TxBuilder(wallet).add(rawCall);

      await builder.send();
      await expect(builder.send()).rejects.toThrow(
        "This transaction has already been sent"
      );
    });

    it("should only call wallet.execute once on double send attempt", async () => {
      const wallet = createMockWallet();
      const builder = new TxBuilder(wallet).add(rawCall);

      await builder.send();
      try {
        await builder.send();
      } catch {
        // expected
      }

      expect(wallet.execute).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================
  // Argument forwarding
  // ============================================================

  describe("argument forwarding", () => {
    it("approve should forward token, spender, and amount to populateApprove", async () => {
      const wallet = createMockWallet();
      const amount = Amount.parse("100", mockUSDC);

      await new TxBuilder(wallet).approve(mockUSDC, dexAddress, amount).calls();

      const erc20 = wallet.erc20(mockUSDC);
      expect(erc20.populateApprove).toHaveBeenCalledWith(dexAddress, amount);
    });

    it("transfer should normalize single transfer to array", async () => {
      const wallet = createMockWallet();
      const amount = Amount.parse("50", mockUSDC);

      await new TxBuilder(wallet)
        .transfer(mockUSDC, { to: alice, amount })
        .calls();

      const erc20 = wallet.erc20(mockUSDC);
      expect(erc20.populateTransfer).toHaveBeenCalledWith([
        { to: alice, amount },
      ]);
    });

    it("enterPool should forward wallet address and amount to populateEnter", async () => {
      const wallet = createMockWallet();
      const amount = Amount.parse("100", mockSTRK);

      await new TxBuilder(wallet).enterPool(poolAddress, amount).calls();

      const staking = await wallet.staking(poolAddress);
      expect(staking.populateEnter).toHaveBeenCalledWith(
        wallet.address,
        amount
      );
    });

    it("addToPool should forward wallet address and amount to populateAdd", async () => {
      const wallet = createMockWallet();
      const amount = Amount.parse("50", mockSTRK);

      await new TxBuilder(wallet).addToPool(poolAddress, amount).calls();

      const staking = await wallet.staking(poolAddress);
      expect(staking.populateAdd).toHaveBeenCalledWith(wallet.address, amount);
    });

    it("claimPoolRewards should forward wallet address to populateClaimRewards", async () => {
      const wallet = createMockWallet();

      await new TxBuilder(wallet).claimPoolRewards(poolAddress).calls();

      const staking = await wallet.staking(poolAddress);
      expect(staking.populateClaimRewards).toHaveBeenCalledWith(wallet.address);
    });

    it("exitPoolIntent should forward amount to populateExitIntent", async () => {
      const wallet = createMockWallet();
      const amount = Amount.parse("50", mockSTRK);

      await new TxBuilder(wallet).exitPoolIntent(poolAddress, amount).calls();

      const staking = await wallet.staking(poolAddress);
      expect(staking.populateExitIntent).toHaveBeenCalledWith(amount);
    });

    it("exitPool should forward wallet address to populateExit", async () => {
      const wallet = createMockWallet();

      await new TxBuilder(wallet).exitPool(poolAddress).calls();

      const staking = await wallet.staking(poolAddress);
      expect(staking.populateExit).toHaveBeenCalledWith(wallet.address);
    });
  });

  // ============================================================
  // calls() idempotency
  // ============================================================

  describe("calls idempotency", () => {
    it("should return the same result when called multiple times", async () => {
      const wallet = createMockWallet();
      const builder = new TxBuilder(wallet)
        .add(rawCall)
        .enterPool(poolAddress, Amount.parse("100", mockSTRK));

      const calls1 = await builder.calls();
      const calls2 = await builder.calls();

      expect(calls1).toEqual(calls2);
    });
  });

  // ============================================================
  // Multiple chained add() calls
  // ============================================================

  describe("multiple add chains", () => {
    it("should accumulate calls from multiple add() invocations", async () => {
      const wallet = createMockWallet();
      const call2: Call = { ...rawCall, entrypoint: "second" };
      const call3: Call = { ...rawCall, entrypoint: "third" };

      const calls = await new TxBuilder(wallet)
        .add(rawCall)
        .add(call2)
        .add(call3)
        .calls();

      expect(calls).toEqual([rawCall, call2, call3]);
    });
  });

  // ============================================================
  // Mixed tokens
  // ============================================================

  describe("mixed tokens", () => {
    it("should handle different tokens in the same builder", async () => {
      const wallet = createMockWallet();
      const usdcAmount = Amount.parse("50", mockUSDC);
      const strkAmount = Amount.parse("100", mockSTRK);

      const calls = await new TxBuilder(wallet)
        .approve(mockSTRK, dexAddress, strkAmount)
        .transfer(mockUSDC, { to: alice, amount: usdcAmount })
        .calls();

      expect(calls).toHaveLength(2);
      // Should have created two different erc20 instances
      expect(wallet.erc20).toHaveBeenCalledWith(mockSTRK);
      expect(wallet.erc20).toHaveBeenCalledWith(mockUSDC);
    });
  });

  // ============================================================
  // send() with async staking operations
  // ============================================================

  describe("send with async operations", () => {
    it("should resolve staking calls and execute them", async () => {
      const wallet = createMockWallet();
      const amount = Amount.parse("100", mockSTRK);

      const tx = await new TxBuilder(wallet)
        .enterPool(poolAddress, amount)
        .send();

      expect(wallet.execute).toHaveBeenCalledTimes(1);
      const executedCalls = (wallet.execute as ReturnType<typeof vi.fn>).mock
        .calls[0]![0] as Call[];
      // enterPool produces [approveCall, enterPoolCall]
      expect(executedCalls).toHaveLength(2);
      expect(tx).toEqual({ hash: "0xtxhash" });
    });
  });

  // ============================================================
  // Error handling
  // ============================================================

  describe("errors", () => {
    it("should surface staking resolution errors in send", async () => {
      const wallet = createMockWallet({
        staking: vi.fn().mockRejectedValue(new Error("pool not found")),
      });

      const builder = new TxBuilder(wallet).enterPool(
        poolAddress,
        Amount.parse("100", mockSTRK)
      );

      await expect(builder.send()).rejects.toThrow("pool not found");
    });

    it("should surface staking resolution errors in calls", async () => {
      const wallet = createMockWallet({
        staking: vi.fn().mockRejectedValue(new Error("pool not found")),
      });

      const builder = new TxBuilder(wallet).enterPool(
        poolAddress,
        Amount.parse("100", mockSTRK)
      );

      await expect(builder.calls()).rejects.toThrow("pool not found");
    });

    it("should propagate wallet.execute errors through send", async () => {
      const wallet = createMockWallet({
        execute: vi.fn().mockRejectedValue(new Error("execution reverted")),
      });

      const builder = new TxBuilder(wallet).add(rawCall);

      await expect(builder.send()).rejects.toThrow("execution reverted");
    });

    it("should allow retry when wallet.execute fails", async () => {
      const wallet = createMockWallet({
        execute: vi
          .fn()
          .mockRejectedValueOnce(new Error("network error"))
          .mockResolvedValueOnce({ hash: "0xretry" }),
      });

      const builder = new TxBuilder(wallet).add(rawCall);

      // First attempt fails
      await expect(builder.send()).rejects.toThrow("network error");

      // Retry succeeds — builder was not marked as sent
      const tx = await builder.send();
      expect(tx).toEqual({ hash: "0xretry" });
      expect(wallet.execute).toHaveBeenCalledTimes(2);
    });
  });
});
