import { describe, expect, it, vi } from "vitest";
import type { Call } from "starknet";
import { Staking } from "@/staking";
import { BaseWallet } from "@/wallet/base";
import type { WalletInterface } from "@/wallet/interface";
import { Amount, fromAddress, type Address, type Token } from "@/types";

const mockToken: Token = {
  name: "Starknet Token",
  address:
    "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d" as Address,
  decimals: 18,
  symbol: "STRK",
};

const poolAddress = fromAddress("0x1234");
const walletAddress = fromAddress("0xCAFE");
const amount = Amount.parse("10", mockToken);

const enterCalls: Call[] = [
  {
    contractAddress: mockToken.address,
    entrypoint: "approve",
    calldata: ["0xspender", "10", "0"],
  },
  {
    contractAddress: poolAddress,
    entrypoint: "enter_delegation_pool",
    calldata: [walletAddress, "10", "0"],
  },
];

const addCalls: Call[] = [
  {
    contractAddress: mockToken.address,
    entrypoint: "approve",
    calldata: ["0xspender", "10", "0"],
  },
  {
    contractAddress: poolAddress,
    entrypoint: "add_to_delegation_pool",
    calldata: [walletAddress, "10", "0"],
  },
];

describe("staking auto stake", () => {
  it("Staking.stake should enter when wallet is not a member", async () => {
    const wallet = {
      address: walletAddress,
      execute: vi.fn().mockResolvedValue({ hash: "0xenter" }),
    } as unknown as WalletInterface;

    const stakingLike = {
      isMember: vi.fn().mockResolvedValue(false),
      populateEnter: vi.fn().mockReturnValue(enterCalls),
      populateAdd: vi.fn().mockReturnValue(addCalls),
    } as unknown as Staking;

    const tx = await Staking.prototype.stake.call(stakingLike, wallet, amount);

    expect(
      (stakingLike as unknown as { isMember: ReturnType<typeof vi.fn> })
        .isMember
    ).toHaveBeenCalledWith(wallet);
    expect(
      (stakingLike as unknown as { populateEnter: ReturnType<typeof vi.fn> })
        .populateEnter
    ).toHaveBeenCalledWith(walletAddress, amount);
    expect(
      (stakingLike as unknown as { populateAdd: ReturnType<typeof vi.fn> })
        .populateAdd
    ).not.toHaveBeenCalled();
    expect(wallet.execute as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      enterCalls,
      undefined
    );
    expect(tx).toEqual({ hash: "0xenter" });
  });

  it("Staking.stake should add when wallet is already a member", async () => {
    const wallet = {
      address: walletAddress,
      execute: vi.fn().mockResolvedValue({ hash: "0xadd" }),
    } as unknown as WalletInterface;

    const stakingLike = {
      isMember: vi.fn().mockResolvedValue(true),
      populateEnter: vi.fn().mockReturnValue(enterCalls),
      populateAdd: vi.fn().mockReturnValue(addCalls),
    } as unknown as Staking;

    const tx = await Staking.prototype.stake.call(stakingLike, wallet, amount);

    expect(
      (stakingLike as unknown as { isMember: ReturnType<typeof vi.fn> })
        .isMember
    ).toHaveBeenCalledWith(wallet);
    expect(
      (stakingLike as unknown as { populateAdd: ReturnType<typeof vi.fn> })
        .populateAdd
    ).toHaveBeenCalledWith(walletAddress, amount);
    expect(
      (stakingLike as unknown as { populateEnter: ReturnType<typeof vi.fn> })
        .populateEnter
    ).not.toHaveBeenCalled();
    expect(wallet.execute as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      addCalls,
      undefined
    );
    expect(tx).toEqual({ hash: "0xadd" });
  });

  it("BaseWallet.stake should delegate to staking.stake", async () => {
    const tx = { hash: "0xstake" };
    const staking = {
      stake: vi.fn().mockResolvedValue(tx),
    };

    const walletLike = {
      staking: vi.fn().mockResolvedValue(staking),
    } as unknown as BaseWallet;

    const options = { feeMode: "sponsored" as const };
    const result = await BaseWallet.prototype.stake.call(
      walletLike,
      poolAddress,
      amount,
      options
    );

    expect(
      (walletLike as unknown as { staking: ReturnType<typeof vi.fn> }).staking
    ).toHaveBeenCalledWith(poolAddress);
    expect(staking.stake).toHaveBeenCalledWith(walletLike, amount, options);
    expect(result).toBe(tx);
  });
});
