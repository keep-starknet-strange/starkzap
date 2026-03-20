import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChainId } from "starkzap";
import { Account, type Call, type RpcProvider } from "starknet";
import { NativeCartridgeWallet } from "@/wallet/cartridge";
import type { CartridgeNativeSessionHandle } from "@/cartridge/types";

function makeProvider(): RpcProvider {
  return {
    getClassHashAt: vi.fn().mockResolvedValue("0xabc"),
  } as unknown as RpcProvider;
}

function makeSession(): CartridgeNativeSessionHandle {
  return {
    account: {
      address: "0x123",
      execute: vi.fn().mockResolvedValue({ transaction_hash: "0xfeed" }),
      estimateInvokeFee: vi.fn().mockResolvedValue({}),
    },
    disconnect: vi.fn().mockResolvedValue(undefined),
    username: vi.fn().mockResolvedValue("native-user"),
    controller: { id: "controller.c" },
  };
}

describe("NativeCartridgeWallet", () => {
  let provider: RpcProvider;
  let session: CartridgeNativeSessionHandle;

  beforeEach(() => {
    provider = makeProvider();
    session = makeSession();
  });

  it("executes sponsored calls and returns tx", async () => {
    const wallet = await NativeCartridgeWallet.create({
      session,
      provider,
      chainId: ChainId.SEPOLIA,
    });
    const tx = await wallet.execute([{ contractAddress: "0x1" } as Call], {
      feeMode: "sponsored",
    });
    expect(tx.hash).toBe("0xfeed");
    expect(wallet.getFeeMode()).toBe("sponsored");
    expect(session.account.execute).toHaveBeenCalledTimes(1);
    expect(wallet.getAccount()).toBeInstanceOf(Account);
  });

  it("rejects unsupported default fee mode during creation", async () => {
    const unsupportedFeeMode = "user_pays" as unknown as "sponsored";

    await expect(
      NativeCartridgeWallet.create({
        session,
        provider,
        chainId: ChainId.SEPOLIA,
        feeMode: unsupportedFeeMode,
      })
    ).rejects.toThrow("supports sponsored session execution only");

    expect(provider.getClassHashAt).not.toHaveBeenCalled();
  });

  it("rejects user_pays execution", async () => {
    const wallet = await NativeCartridgeWallet.create({
      session,
      provider,
      chainId: ChainId.SEPOLIA,
    });
    await expect(
      wallet.execute([{ contractAddress: "0x1" } as Call], {
        feeMode: "user_pays",
      })
    ).rejects.toThrow("supports sponsored session execution only");
  });

  it("rejects deploy and deploy-driven ensureReady", async () => {
    const undeployedProvider = {
      getClassHashAt: vi
        .fn()
        .mockRejectedValue(new Error("contract not found")),
    } as unknown as RpcProvider;
    const wallet = await NativeCartridgeWallet.create({
      session,
      provider: undeployedProvider,
      chainId: ChainId.SEPOLIA,
    });

    await expect(wallet.deploy()).rejects.toThrow(
      "does not support deployment in this release"
    );
    await expect(wallet.ensureReady({ deploy: "if_needed" })).rejects.toThrow(
      "does not support deployment in this release"
    );
  });

  it("fails fast on execute when the account is undeployed", async () => {
    const undeployedProvider = {
      getClassHashAt: vi
        .fn()
        .mockRejectedValue(new Error("contract not found")),
    } as unknown as RpcProvider;
    const wallet = await NativeCartridgeWallet.create({
      session,
      provider: undeployedProvider,
      chainId: ChainId.SEPOLIA,
    });

    await expect(
      wallet.execute([{ contractAddress: "0x1" } as Call], {
        feeMode: "sponsored",
      })
    ).rejects.toThrow("Account not deployed and deploy mode is 'never'");

    expect(session.account.execute).not.toHaveBeenCalled();
  });

  it("fails preflight when simulation is unavailable and the account is undeployed", async () => {
    const undeployedProvider = {
      getClassHashAt: vi
        .fn()
        .mockRejectedValue(new Error("contract not found")),
    } as unknown as RpcProvider;
    const wallet = await NativeCartridgeWallet.create({
      session,
      provider: undeployedProvider,
      chainId: ChainId.SEPOLIA,
    });

    await expect(
      wallet.preflight({
        calls: [{ contractAddress: "0x1" } as Call],
        feeMode: "sponsored",
      })
    ).resolves.toEqual({
      ok: false,
      reason: "Account not deployed and deploy mode is 'never'",
    });
  });

  it("throws when class hash is unavailable for undeployed accounts", async () => {
    const undeployedProvider = {
      getClassHashAt: vi
        .fn()
        .mockRejectedValue(new Error("contract not found")),
    } as unknown as RpcProvider;
    const wallet = await NativeCartridgeWallet.create({
      session,
      provider: undeployedProvider,
      chainId: ChainId.SEPOLIA,
    });

    expect(() => wallet.getClassHash()).toThrow(
      "Account class hash is unavailable for undeployed Cartridge accounts."
    );
  });

  it("rethrows unexpected class hash lookup failures during creation", async () => {
    const brokenProvider = {
      getClassHashAt: vi.fn().mockRejectedValue(new Error("rpc timeout")),
    } as unknown as RpcProvider;

    await expect(
      NativeCartridgeWallet.create({
        session,
        provider: brokenProvider,
        chainId: ChainId.SEPOLIA,
      })
    ).rejects.toThrow("rpc timeout");
  });

  it("disconnects and exposes username/controller", async () => {
    const wallet = await NativeCartridgeWallet.create({
      session,
      provider,
      chainId: ChainId.SEPOLIA,
    });
    expect(await wallet.username()).toBe("native-user");
    expect(wallet.getController()).toEqual({ id: "controller.c" });
    await wallet.disconnect();
    expect(session.disconnect).toHaveBeenCalledTimes(1);
  });
});
