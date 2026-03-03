import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChainId } from "starkzap";
import type { Call, RpcProvider } from "starknet";
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
      executePaymasterTransaction: vi
        .fn()
        .mockResolvedValue({ transaction_hash: "0xfeed" }),
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
    expect(session.account.executePaymasterTransaction).toHaveBeenCalledTimes(1);
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
      getClassHashAt: vi.fn().mockRejectedValue(new Error("contract not found")),
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

