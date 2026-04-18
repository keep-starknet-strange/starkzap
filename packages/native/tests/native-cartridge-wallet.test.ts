import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChainId, type BridgingConfig } from "starkzap";
import {
  Account,
  type Call,
  type PaymasterTimeBounds,
  type RpcProvider,
  type UniversalDetails,
} from "starknet";
import {
  CartridgeRecoveredRpcExecutionError,
  NativeCartridgeWallet,
} from "@/wallet/cartridge";
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
      feeMode: { type: "paymaster" },
    });

    expect(tx.hash).toBe("0xfeed");
    expect(wallet.getFeeMode()).toEqual({ type: "paymaster" });
    expect(session.account.execute).toHaveBeenCalledTimes(1);
    expect(wallet.getAccount()).toBeInstanceOf(Account);
  });

  it("rejects wallet.execute when session returns recovered_from_rpc_error", async () => {
    vi.mocked(session.account.execute).mockResolvedValue({
      transaction_hash: "0x123",
      recovered_from_rpc_error: true,
    });

    const wallet = await NativeCartridgeWallet.create({
      session,
      provider,
      chainId: ChainId.SEPOLIA,
    });

    const err = await wallet
      .execute([{ contractAddress: "0x1" } as Call], {
        feeMode: { type: "paymaster" },
      })
      .then(
        () => {
          throw new Error("expected execute to reject");
        },
        (e: unknown) => e
      );

    expect(err).toBeInstanceOf(CartridgeRecoveredRpcExecutionError);
    expect(err).toMatchObject({
      message: expect.stringMatching(/recovered/i),
      transactionHash: "0x123",
      recoveredFromRpcError: true,
    });
    expect(session.account.execute).toHaveBeenCalledTimes(1);
  });

  it("rejects account.execute when session returns recovered_from_rpc_error", async () => {
    vi.mocked(session.account.execute).mockResolvedValue({
      transaction_hash: "0x123",
      recovered_from_rpc_error: true,
    });

    const wallet = await NativeCartridgeWallet.create({
      session,
      provider,
      chainId: ChainId.SEPOLIA,
    });

    const calls = [{ contractAddress: "0x1" } as Call];

    const err = await wallet
      .getAccount()
      .execute(calls)
      .then(
        () => {
          throw new Error("expected execute to reject");
        },
        (e: unknown) => e
      );

    expect(err).toBeInstanceOf(CartridgeRecoveredRpcExecutionError);
    expect(err).toMatchObject({
      message: expect.stringMatching(/recovered/i),
      transactionHash: "0x123",
      recoveredFromRpcError: true,
    });
    expect(session.account.execute).toHaveBeenCalledTimes(1);
  });

  it("rejects unsupported default fee mode during creation", async () => {
    const unsupportedFeeMode = "user_pays" as const;

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

  it("supports sponsored execute when the account is undeployed", async () => {
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
        feeMode: { type: "paymaster" },
      })
    ).resolves.toMatchObject({ hash: "0xfeed" });

    expect(session.account.execute).toHaveBeenCalledTimes(1);
  });

  it("prefers runtime time bounds on the account execute path", async () => {
    const calls = [{ contractAddress: "0x1" } as Call];
    const defaultTimeBounds: PaymasterTimeBounds = { executeBefore: 100 };
    const runtimeTimeBounds: PaymasterTimeBounds = { executeBefore: 200 };
    const wallet = await NativeCartridgeWallet.create({
      session,
      provider,
      chainId: ChainId.SEPOLIA,
      timeBounds: defaultTimeBounds,
    });

    await wallet.getAccount().execute(calls, {
      timeBounds: runtimeTimeBounds,
    } as UniversalDetails & { timeBounds: PaymasterTimeBounds });

    expect(session.account.execute).toHaveBeenCalledWith(calls, {
      feeMode: { mode: "sponsored" },
      timeBounds: runtimeTimeBounds,
    });
  });

  it("returns a sendable preflight result when simulation is unavailable and the account is undeployed", async () => {
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
        feeMode: { type: "paymaster" },
      })
    ).resolves.toEqual({
      ok: true,
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

  it("retains bridging config on the native wallet path", async () => {
    const bridging: BridgingConfig = {
      layerZeroApiKey: "lz-key",
      ethereumRpcUrl: "https://eth.example",
      solanaRpcUrl: "https://sol.example",
    };

    const wallet = await NativeCartridgeWallet.create({
      session,
      provider,
      chainId: ChainId.SEPOLIA,
      bridging,
    });

    expect(
      (wallet as unknown as { bridging: { bridgingConfig?: BridgingConfig } })
        .bridging.bridgingConfig
    ).toEqual(bridging);
  });
});
