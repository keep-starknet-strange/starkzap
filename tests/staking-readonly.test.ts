import { describe, expect, it, vi } from "vitest";
import { Staking } from "@/staking";
import { fromAddress, type Address, type Token } from "@/types";
import type { WalletInterface } from "@/wallet/interface";

const mockToken: Token = {
  name: "Starknet Token",
  address:
    "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d" as Address,
  decimals: 18,
  symbol: "STRK",
};

describe("Staking.getPosition", () => {
  it("should accept a raw address string", async () => {
    const rawAddress =
      "0x0234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    const normalizedAddress = fromAddress(rawAddress);
    const getPoolMemberInfo = vi.fn().mockResolvedValue({
      isNone: () => true,
      unwrap: () => undefined,
    });

    const stakingLike = {
      pool: { get_pool_member_info_v1: getPoolMemberInfo },
      token: mockToken,
    } as unknown as Staking;

    const position = await Staking.prototype.getPosition.call(
      stakingLike,
      rawAddress
    );

    expect(getPoolMemberInfo).toHaveBeenCalledWith(normalizedAddress);
    expect(position).toBeNull();
  });

  it("should accept an address directly", async () => {
    const walletAddress = fromAddress("0xCAFE");
    const rewardAddress = fromAddress("0xBEEF");
    const getPoolMemberInfo = vi.fn().mockResolvedValue({
      isNone: () => false,
      unwrap: () => ({
        amount: 1000000000000000000n,
        unclaimed_rewards: 250000000000000000n,
        unpool_amount: 50000000000000000n,
        commission: 250n,
        unpool_time: {
          isSome: () => true,
          unwrap: () => ({ seconds: 1710000000n }),
        },
        reward_address: rewardAddress,
      }),
    });

    const stakingLike = {
      pool: { get_pool_member_info_v1: getPoolMemberInfo },
      token: mockToken,
    } as unknown as Staking;

    const position = await Staking.prototype.getPosition.call(
      stakingLike,
      walletAddress
    );

    expect(getPoolMemberInfo).toHaveBeenCalledWith(walletAddress);
    expect(position?.staked.toBase()).toBe(1000000000000000000n);
    expect(position?.rewards.toBase()).toBe(250000000000000000n);
    expect(position?.total.toBase()).toBe(1250000000000000000n);
    expect(position?.unpooling.toBase()).toBe(50000000000000000n);
    expect(position?.commissionPercent).toBe(2.5);
    expect(position?.unpoolTime).toEqual(new Date(1710000000 * 1000));
  });

  it("should keep wallet input support", async () => {
    const walletAddress = fromAddress("0x1234");
    const wallet = { address: walletAddress } as WalletInterface;
    const getPoolMemberInfo = vi.fn().mockResolvedValue({
      isNone: () => true,
      unwrap: () => undefined,
    });

    const stakingLike = {
      pool: { get_pool_member_info_v1: getPoolMemberInfo },
      token: mockToken,
    } as unknown as Staking;

    const position = await Staking.prototype.getPosition.call(
      stakingLike,
      wallet
    );

    expect(getPoolMemberInfo).toHaveBeenCalledWith(walletAddress);
    expect(position).toBeNull();
  });
});
