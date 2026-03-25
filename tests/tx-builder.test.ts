import { describe, expect, it, vi } from "vitest";
import {
  Amount,
  ChainId,
  type Address,
  fromAddress,
  type Token,
} from "@/types";
import { TxBuilder } from "@/tx/builder";
import { Erc20 } from "@/erc20";
import type { WalletInterface } from "@/wallet/interface";
import type { Call } from "starknet";
import type { Staking } from "@/staking";
import type { SwapProvider } from "@/swap";
import type { ConfidentialProvider } from "@/confidential";
import {
  testLendingCollateralToken as mockSTRK,
  testLendingDebtToken as mockUSDC,
} from "./fixtures/lending";

// ─── Test fixtures ───────────────────────────────────────────────────────────

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

const lendingDepositCall: Call = {
  contractAddress: fromAddress("0x501"),
  entrypoint: "deposit",
  calldata: ["100", "0", "0xwallet"],
};

const lendingWithdrawCall: Call = {
  contractAddress: fromAddress("0x502"),
  entrypoint: "withdraw",
  calldata: ["100", "0", "0xwallet", "0xwallet"],
};

const lendingWithdrawMaxCall: Call = {
  contractAddress: fromAddress("0x502"),
  entrypoint: "redeem",
  calldata: ["100", "0", "0xwallet", "0xwallet"],
};

const lendingBorrowCall: Call = {
  contractAddress: fromAddress("0x503"),
  entrypoint: "modify_position",
  calldata: [1, 2, 3],
};

const lendingRepayCall: Call = {
  contractAddress: fromAddress("0x504"),
  entrypoint: "modify_position",
  calldata: [4, 5, 6],
};

const dcaCreateCall: Call = {
  contractAddress: fromAddress("0x601"),
  entrypoint: "open_dca",
  calldata: [7, 8, 9],
};

const dcaCancelCall: Call = {
  contractAddress: fromAddress("0x602"),
  entrypoint: "cancel_dca",
  calldata: [10, 11, 12],
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

const addPoolCall: Call = {
  contractAddress: poolAddress,
  entrypoint: "add_to_delegation_pool",
  calldata: ["0xwallet", "100", "0"],
};

function createMockStaking(isMember = false) {
  return {
    poolAddress,
    isMember: vi.fn().mockResolvedValue(isMember),
    populateEnter: vi.fn().mockReturnValue([approveCall, enterPoolCall]),
    populateAdd: vi.fn().mockReturnValue([approveCall, addPoolCall]),
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
  const mockLending = {
    prepareDeposit: vi.fn().mockResolvedValue({
      calls: [lendingDepositCall],
    }),
    prepareWithdraw: vi.fn().mockResolvedValue({
      calls: [lendingWithdrawCall],
    }),
    prepareWithdrawMax: vi.fn().mockResolvedValue({
      calls: [lendingWithdrawMaxCall],
    }),
    prepareBorrow: vi.fn().mockResolvedValue({
      calls: [lendingBorrowCall],
    }),
    prepareRepay: vi.fn().mockResolvedValue({
      calls: [lendingRepayCall],
    }),
  };
  const mockDca = {
    prepareCreate: vi.fn().mockResolvedValue({
      calls: [dcaCreateCall],
    }),
    prepareCancel: vi.fn().mockResolvedValue({
      calls: [dcaCancelCall],
    }),
  };
  const defaultSwapProvider: SwapProvider = {
    id: "default",
    supportsChain: () => true,
    getQuote: vi.fn(),
    prepareSwap: vi.fn().mockResolvedValue({
      calls: [rawCall],
      quote: {
        amountInBase: 1n,
        amountOutBase: 2n,
      },
    }),
  };
  const prepareSwap = vi.fn().mockResolvedValue({
    calls: [rawCall],
    quote: {
      amountInBase: 1n,
      amountOutBase: 2n,
    },
  });

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
    lending: vi.fn().mockReturnValue(mockLending),
    dca: vi.fn().mockReturnValue(mockDca),
    getChainId: vi.fn().mockReturnValue(ChainId.SEPOLIA),
    getDefaultSwapProvider: vi.fn().mockReturnValue(defaultSwapProvider),
    getSwapProvider: vi.fn().mockReturnValue(defaultSwapProvider),
    prepareSwap,
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
      expect(
        builder.swap({
          provider: {
            id: "provider",
            supportsChain: vi.fn().mockReturnValue(true),
            getQuote: vi.fn().mockResolvedValue({
              amountInBase: 1n,
              amountOutBase: 2n,
            }),
            prepareSwap: vi.fn().mockResolvedValue({
              calls: [rawCall],
              quote: { amountInBase: 1n, amountOutBase: 2n },
            }),
          } as unknown as SwapProvider,
          chainId: { toLiteral: () => "SN_SEPOLIA" } as unknown,
          tokenIn: mockUSDC,
          tokenOut: mockSTRK,
          amountIn: amount,
        } as unknown)
      ).toBe(builder);
      expect(builder.stake(poolAddress, amount)).toBe(builder);
      expect(builder.enterPool(poolAddress, amount)).toBe(builder);
      expect(builder.addToPool(poolAddress, amount)).toBe(builder);
      expect(builder.claimPoolRewards(poolAddress)).toBe(builder);
      expect(builder.exitPoolIntent(poolAddress, amount)).toBe(builder);
      expect(builder.exitPool(poolAddress)).toBe(builder);
      expect(builder.lendDeposit({ token: mockUSDC, amount } as unknown)).toBe(
        builder
      );
      expect(builder.lendWithdraw({ token: mockUSDC, amount } as unknown)).toBe(
        builder
      );
      expect(builder.lendWithdrawMax({ token: mockUSDC } as unknown)).toBe(
        builder
      );
      expect(
        builder.lendBorrow({
          collateralToken: mockSTRK,
          debtToken: mockUSDC,
          amount,
        } as unknown)
      ).toBe(builder);
      expect(
        builder.lendRepay({
          collateralToken: mockSTRK,
          debtToken: mockUSDC,
          amount,
        } as unknown)
      ).toBe(builder);
      expect(
        builder.dcaCreate({
          sellToken: mockUSDC,
          buyToken: mockSTRK,
          sellAmount: amount,
          sellAmountPerCycle: Amount.parse("10", mockUSDC),
          frequency: "P1D",
        })
      ).toBe(builder);
      expect(builder.dcaCancel({ orderAddress: "0x123" })).toBe(builder);
    });
  });

  // ============================================================
  // State accessors
  // ============================================================

  describe("length / isEmpty / isSent", () => {
    it("should start empty", () => {
      const wallet = createMockWallet();
      const builder = new TxBuilder(wallet);

      expect(builder.length).toBe(0);
      expect(builder.isEmpty).toBe(true);
      expect(builder.isSent).toBe(false);
    });

    it("should track the number of pending operations", () => {
      const wallet = createMockWallet();
      const amount = Amount.parse("100", mockUSDC);
      const builder = new TxBuilder(wallet)
        .add(rawCall)
        .transfer(mockUSDC, { to: alice, amount })
        .approve(mockUSDC, dexAddress, amount);

      expect(builder.length).toBe(3);
      expect(builder.isEmpty).toBe(false);
    });

    it("should reflect sent state after send()", async () => {
      const wallet = createMockWallet();
      const builder = new TxBuilder(wallet).add(rawCall);

      expect(builder.isSent).toBe(false);
      await builder.send();
      expect(builder.isSent).toBe(true);
    });

    it("should not mark as sent when send() fails", async () => {
      const wallet = createMockWallet({
        execute: vi.fn().mockRejectedValue(new Error("fail")),
      });
      const builder = new TxBuilder(wallet).add(rawCall);

      await expect(builder.send()).rejects.toThrow("fail");
      expect(builder.isSent).toBe(false);
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

  describe("swap", () => {
    it("should resolve swap calls via wallet.prepareSwap", async () => {
      const swapCalls: Call[] = [
        {
          contractAddress: fromAddress("0x999"),
          entrypoint: "swap",
          calldata: [1, 2, 3],
        },
      ];
      const request = {
        provider: "ekubo",
        chainId: ChainId.SEPOLIA,
        tokenIn: mockUSDC,
        tokenOut: mockSTRK,
        amountIn: Amount.parse("1", mockUSDC),
      };
      const wallet = createMockWallet({
        prepareSwap: vi.fn().mockResolvedValue({
          calls: swapCalls,
          quote: {
            amountInBase: 1n,
            amountOutBase: 2n,
          },
        }),
      });

      const calls = await new TxBuilder(wallet).swap(request).calls();

      expect(wallet.prepareSwap).toHaveBeenCalledWith(request);
      expect(calls).toEqual(swapCalls);
    });

    it("should pass the original swap request through unchanged", async () => {
      const request = {
        tokenIn: mockUSDC,
        tokenOut: mockSTRK,
        amountIn: Amount.parse("1", mockUSDC),
      };
      const wallet = createMockWallet();

      await new TxBuilder(wallet).swap(request).calls();

      expect(wallet.prepareSwap).toHaveBeenCalledWith(request);
    });

    it("should fail fast for invalid swap providers without mutating the builder", () => {
      const request = {
        provider: "missing",
        tokenIn: mockUSDC,
        tokenOut: mockSTRK,
        amountIn: Amount.parse("1", mockUSDC),
      } as const;
      const wallet = createMockWallet({
        getSwapProvider: vi.fn().mockImplementation(() => {
          throw new Error(
            'Unknown swap provider "missing". Registered providers: default'
          );
        }),
      });
      const builder = new TxBuilder(wallet);

      expect(() => builder.swap(request)).toThrow(
        'Unknown swap provider "missing". Registered providers: default'
      );
      expect(builder.length).toBe(0);
      expect(wallet.prepareSwap).not.toHaveBeenCalled();
    });

    it("should propagate wallet.prepareSwap failures", async () => {
      const request = {
        tokenIn: mockUSDC,
        tokenOut: mockSTRK,
        amountIn: Amount.parse("1", mockUSDC),
      };
      const wallet = createMockWallet({
        prepareSwap: vi
          .fn()
          .mockRejectedValue(new Error("invalid swap payload")),
      });

      await expect(new TxBuilder(wallet).swap(request).calls()).rejects.toThrow(
        "invalid swap payload"
      );
    });

    it("should throw when wallet.prepareSwap returns no calls", async () => {
      const request = {
        tokenIn: mockUSDC,
        tokenOut: mockSTRK,
        amountIn: Amount.parse("1", mockUSDC),
      };
      const wallet = createMockWallet({
        prepareSwap: vi.fn().mockResolvedValue({
          calls: [],
          quote: {
            amountInBase: 1n,
            amountOutBase: 2n,
          },
        }),
      });

      await expect(new TxBuilder(wallet).swap(request).calls()).rejects.toThrow(
        'Swap action "swap" returned no calls'
      );
    });
  });

  describe("lending", () => {
    it("should resolve lending deposit calls", async () => {
      const wallet = createMockWallet();
      const amount = Amount.parse("100", mockUSDC);

      const calls = await new TxBuilder(wallet)
        .lendDeposit({ token: mockUSDC, amount })
        .calls();

      expect(wallet.lending).toHaveBeenCalledTimes(1);
      const lending = wallet.lending();
      expect(lending.prepareDeposit).toHaveBeenCalledWith({
        token: mockUSDC,
        amount,
      });
      expect(calls).toEqual([lendingDepositCall]);
    });

    it("should resolve lending withdraw calls", async () => {
      const wallet = createMockWallet();
      const amount = Amount.parse("100", mockUSDC);

      const calls = await new TxBuilder(wallet)
        .lendWithdraw({ token: mockUSDC, amount })
        .calls();

      expect(calls).toEqual([lendingWithdrawCall]);
      const lending = wallet.lending();
      expect(lending.prepareWithdraw).toHaveBeenCalledWith({
        token: mockUSDC,
        amount,
      });
    });

    it("should resolve lending withdrawMax calls", async () => {
      const wallet = createMockWallet();

      const calls = await new TxBuilder(wallet)
        .lendWithdrawMax({ token: mockUSDC })
        .calls();

      expect(calls).toEqual([lendingWithdrawMaxCall]);
      const lending = wallet.lending();
      expect(lending.prepareWithdrawMax).toHaveBeenCalledWith({
        token: mockUSDC,
      });
    });

    it("should resolve lending borrow calls", async () => {
      const wallet = createMockWallet();
      const amount = Amount.parse("10", mockUSDC);

      const calls = await new TxBuilder(wallet)
        .lendBorrow({
          collateralToken: mockSTRK,
          debtToken: mockUSDC,
          amount,
        })
        .calls();

      expect(calls).toEqual([lendingBorrowCall]);
      const lending = wallet.lending();
      expect(lending.prepareBorrow).toHaveBeenCalledWith({
        collateralToken: mockSTRK,
        debtToken: mockUSDC,
        amount,
      });
    });

    it("should resolve lending repay calls", async () => {
      const wallet = createMockWallet();
      const amount = Amount.parse("10", mockUSDC);

      const calls = await new TxBuilder(wallet)
        .lendRepay({
          collateralToken: mockSTRK,
          debtToken: mockUSDC,
          amount,
        })
        .calls();

      expect(calls).toEqual([lendingRepayCall]);
      const lending = wallet.lending();
      expect(lending.prepareRepay).toHaveBeenCalledWith({
        collateralToken: mockSTRK,
        debtToken: mockUSDC,
        amount,
      });
    });

    it("should throw when lending withdrawMax returns no calls", async () => {
      const wallet = createMockWallet({
        lending: vi.fn().mockReturnValue({
          prepareWithdrawMax: vi.fn().mockResolvedValue({ calls: [] }),
        }),
      });

      await expect(
        new TxBuilder(wallet)
          .lendWithdrawMax({
            token: mockUSDC,
          })
          .calls()
      ).rejects.toThrow('Lending action "withdrawMax" returned no calls');
    });
  });

  describe("dca", () => {
    it("should resolve DCA create calls via wallet.dca()", async () => {
      const wallet = createMockWallet();
      const dcaManager = wallet.dca();
      (wallet.dca as ReturnType<typeof vi.fn>).mockClear();
      const sellAmount = Amount.parse("100", mockUSDC);
      const sellAmountPerCycle = Amount.parse("10", mockUSDC);
      const request = {
        sellToken: mockUSDC,
        buyToken: mockSTRK,
        sellAmount,
        sellAmountPerCycle,
        frequency: "P1D",
      };

      const calls = await new TxBuilder(wallet).dcaCreate(request).calls();

      expect(wallet.dca).toHaveBeenCalledTimes(1);
      expect(dcaManager.prepareCreate).toHaveBeenCalledWith(request);
      expect(calls).toEqual([dcaCreateCall]);
    });

    it("should resolve DCA cancel calls via wallet.dca()", async () => {
      const wallet = createMockWallet();
      const dcaManager = wallet.dca();
      (wallet.dca as ReturnType<typeof vi.fn>).mockClear();
      const request = { orderAddress: "0x123" };

      const calls = await new TxBuilder(wallet).dcaCancel(request).calls();

      expect(wallet.dca).toHaveBeenCalledTimes(1);
      expect(dcaManager.prepareCancel).toHaveBeenCalledWith(request);
      expect(calls).toEqual([dcaCancelCall]);
    });

    it("should throw when DCA create returns no calls", async () => {
      const wallet = createMockWallet({
        dca: vi.fn().mockReturnValue({
          prepareCreate: vi.fn().mockResolvedValue({ calls: [] }),
          prepareCancel: vi.fn(),
        }),
      });

      await expect(
        new TxBuilder(wallet)
          .dcaCreate({
            sellToken: mockUSDC,
            buyToken: mockSTRK,
            sellAmount: Amount.parse("100", mockUSDC),
            sellAmountPerCycle: Amount.parse("10", mockUSDC),
            frequency: "P1D",
          })
          .calls()
      ).rejects.toThrow('DCA action "create" returned no calls');
    });

    it("should throw when DCA cancel returns no calls", async () => {
      const wallet = createMockWallet({
        dca: vi.fn().mockReturnValue({
          prepareCreate: vi.fn(),
          prepareCancel: vi.fn().mockResolvedValue({ calls: [] }),
        }),
      });

      await expect(
        new TxBuilder(wallet)
          .dcaCancel({
            orderId: "ekubo-v1:0x1:7:0x111:0x222:300:1710000000:1710086400",
          })
          .calls()
      ).rejects.toThrow('DCA action "cancel" returned no calls');
    });
  });

  // ============================================================
  // Staking operations
  // ============================================================

  describe("stake", () => {
    it("should call populateEnter when wallet is not a member", async () => {
      const mockStaking = createMockStaking(false);
      const wallet = createMockWallet({
        staking: vi.fn().mockResolvedValue(mockStaking),
      });
      const amount = Amount.parse("100", mockSTRK);

      const calls = await new TxBuilder(wallet)
        .stake(poolAddress, amount)
        .calls();

      expect(mockStaking.isMember).toHaveBeenCalledWith(wallet);
      expect(mockStaking.populateEnter).toHaveBeenCalled();
      expect(mockStaking.populateAdd).not.toHaveBeenCalled();
      expect(calls).toHaveLength(2);
      expect(calls[0].entrypoint).toBe("approve");
      expect(calls[1].entrypoint).toBe("enter_delegation_pool");
    });

    it("should call populateAdd when wallet is already a member", async () => {
      const mockStaking = createMockStaking(true);
      const wallet = createMockWallet({
        staking: vi.fn().mockResolvedValue(mockStaking),
      });
      const amount = Amount.parse("100", mockSTRK);

      const calls = await new TxBuilder(wallet)
        .stake(poolAddress, amount)
        .calls();

      expect(mockStaking.isMember).toHaveBeenCalledWith(wallet);
      expect(mockStaking.populateAdd).toHaveBeenCalled();
      expect(mockStaking.populateEnter).not.toHaveBeenCalled();
      expect(calls).toHaveLength(2);
      expect(calls[0].entrypoint).toBe("approve");
      expect(calls[1].entrypoint).toBe("add_to_delegation_pool");
    });

    it("should propagate staking resolution errors", async () => {
      const wallet = createMockWallet({
        staking: vi.fn().mockRejectedValue(new Error("pool not found")),
      });
      const amount = Amount.parse("100", mockSTRK);

      await expect(
        new TxBuilder(wallet).stake(poolAddress, amount).calls()
      ).rejects.toThrow("pool not found");
    });
  });

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
  // Confidential operations
  // ============================================================

  describe("confidentialFund", () => {
    it("should return the same builder instance", () => {
      const wallet = createMockWallet();
      const builder = new TxBuilder(wallet);
      const mockConfidential = {
        fund: vi.fn().mockResolvedValue([rawCall]),
      } as unknown as ConfidentialProvider;

      expect(
        builder.confidentialFund(mockConfidential, {
          amount: Amount.fromRaw(100n, 0),
          sender: fromAddress("0xABC1"),
        })
      ).toBe(builder);
    });

    it("should queue calls from fund", async () => {
      const fundCall: Call = {
        contractAddress: "0xTONGO",
        entrypoint: "fund",
        calldata: ["0x1"],
      };
      const mockConfidential = {
        fund: vi.fn().mockResolvedValue([fundCall]),
      } as unknown as ConfidentialProvider;

      const wallet = createMockWallet();
      const calls = await new TxBuilder(wallet)
        .confidentialFund(mockConfidential, {
          amount: Amount.fromRaw(100n, 0),
          sender: fromAddress("0xABC1"),
        })
        .calls();

      expect(calls).toEqual([fundCall]);
      expect(mockConfidential.fund).toHaveBeenCalledWith({
        amount: Amount.fromRaw(100n, 0),
        sender: fromAddress("0xABC1"),
      });
    });
  });

  describe("confidentialTransfer", () => {
    it("should queue calls from transfer", async () => {
      const transferCall: Call = {
        contractAddress: "0xTONGO",
        entrypoint: "transfer",
        calldata: ["0x2"],
      };
      const mockConfidential = {
        transfer: vi.fn().mockResolvedValue([transferCall]),
      } as unknown as ConfidentialProvider;

      const wallet = createMockWallet();
      const calls = await new TxBuilder(wallet)
        .confidentialTransfer(mockConfidential, {
          amount: Amount.fromRaw(50n, 0),
          to: { x: 1n, y: 2n },
          sender: fromAddress("0xABC1"),
        })
        .calls();

      expect(calls).toEqual([transferCall]);
      expect(mockConfidential.transfer).toHaveBeenCalledWith({
        amount: Amount.fromRaw(50n, 0),
        to: { x: 1n, y: 2n },
        sender: fromAddress("0xABC1"),
      });
    });
  });

  describe("confidentialWithdraw", () => {
    it("should queue calls from withdraw", async () => {
      const withdrawCall: Call = {
        contractAddress: "0xTONGO",
        entrypoint: "withdraw",
        calldata: ["0x3"],
      };
      const mockConfidential = {
        withdraw: vi.fn().mockResolvedValue([withdrawCall]),
      } as unknown as ConfidentialProvider;

      const wallet = createMockWallet();
      const calls = await new TxBuilder(wallet)
        .confidentialWithdraw(mockConfidential, {
          amount: Amount.fromRaw(25n, 0),
          to: fromAddress("0xBEEF"),
          sender: fromAddress("0xABC1"),
        })
        .calls();

      expect(calls).toEqual([withdrawCall]);
    });
  });

  describe("confidential error handling", () => {
    it("should propagate populate errors through send", async () => {
      const mockConfidential = {
        fund: vi.fn().mockRejectedValue(new Error("proof generation failed")),
      } as unknown as ConfidentialProvider;

      const wallet = createMockWallet();
      const builder = new TxBuilder(wallet).confidentialFund(mockConfidential, {
        amount: Amount.fromRaw(100n, 0),
        sender: fromAddress("0xABC1"),
      });

      await expect(builder.send()).rejects.toThrow("proof generation failed");
    });
  });

  describe("confidential mixed batching", () => {
    it("should batch confidential calls with other operations", async () => {
      const confidentialCall: Call = {
        contractAddress: "0xTONGO",
        entrypoint: "fund",
        calldata: ["0x1"],
      };
      const mockConfidential = {
        fund: vi.fn().mockResolvedValue([confidentialCall]),
      } as unknown as ConfidentialProvider;

      const wallet = createMockWallet();
      const amount = Amount.parse("100", mockUSDC);

      const calls = await new TxBuilder(wallet)
        .approve(mockUSDC, fromAddress("0xDEAD"), amount)
        .confidentialFund(mockConfidential, {
          amount: Amount.fromRaw(100n, 0),
          sender: fromAddress("0xABC1"),
        })
        .transfer(mockUSDC, { to: alice, amount })
        .calls();

      expect(calls).toHaveLength(3);
      expect(calls[0]!.entrypoint).toBe("approve");
      expect(calls[1]!.entrypoint).toBe("fund");
      expect(calls[2]!.entrypoint).toBe("transfer");
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

  describe("preflight", () => {
    it("should delegate to wallet.preflight with resolved calls", async () => {
      const wallet = createMockWallet({
        preflight: vi.fn().mockResolvedValue({ ok: true }),
      });

      const result = await new TxBuilder(wallet).add(rawCall).preflight();

      expect(wallet.preflight).toHaveBeenCalledWith({ calls: [rawCall] });
      expect(result).toEqual({ ok: true });
    });

    it("should return failure reason from simulation", async () => {
      const wallet = createMockWallet({
        preflight: vi
          .fn()
          .mockResolvedValue({ ok: false, reason: "insufficient balance" }),
      });

      const result = await new TxBuilder(wallet).add(rawCall).preflight();

      expect(result).toEqual({ ok: false, reason: "insufficient balance" });
    });

    it("should resolve async staking calls before simulating", async () => {
      const mockStaking = createMockStaking(false);
      const wallet = createMockWallet({
        staking: vi.fn().mockResolvedValue(mockStaking),
        preflight: vi.fn().mockResolvedValue({ ok: true }),
      });
      const amount = Amount.parse("100", mockSTRK);

      await new TxBuilder(wallet).stake(poolAddress, amount).preflight();

      expect(wallet.preflight).toHaveBeenCalledWith({
        calls: expect.arrayContaining([
          expect.objectContaining({ entrypoint: "approve" }),
          expect.objectContaining({
            entrypoint: "enter_delegation_pool",
          }),
        ]),
      });
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

    it("should reject concurrent send attempts while the first send is in flight", async () => {
      let resolveExecute: ((value: { hash: string }) => void) | undefined;
      const executePromise = new Promise<{ hash: string }>((resolve) => {
        resolveExecute = resolve;
      });
      const wallet = createMockWallet({
        execute: vi.fn().mockReturnValue(executePromise),
      });
      const builder = new TxBuilder(wallet).add(rawCall);

      const firstSend = builder.send();
      await Promise.resolve();

      await expect(builder.send()).rejects.toThrow(
        "This transaction is currently being sent"
      );
      expect(wallet.execute).toHaveBeenCalledTimes(1);

      resolveExecute?.({ hash: "0xtxhash" });
      await expect(firstSend).resolves.toEqual({ hash: "0xtxhash" });
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
