import { describe, expect, it, vi } from "vitest";
import type { Call } from "starknet";
import {
  TsSessionAccount,
  type TsExecute,
  type TsExecuteFromOutside,
} from "@/cartridge/ts/session_account";
import type { SessionRegistration } from "@/cartridge/ts/session_api";

const SESSION: SessionRegistration = {
  username: "player1",
  address:
    "0x0000000000000000000000000000000000000000000000000000000000000abc",
  ownerGuid: "0x123",
  expiresAt: "4702444800",
  guardianKeyGuid: "0x0",
  metadataHash: "0x0",
  sessionKeyGuid: "0x999",
};

const CALLS: Call[] = [
  {
    contractAddress:
      "0x0000000000000000000000000000000000000000000000000000000000000001",
    entrypoint: "create_game",
    calldata: [],
  },
];

function createAccount(options: {
  executeFromOutside?: TsExecuteFromOutside;
  execute?: TsExecute;
} = {}): TsSessionAccount {
  return new TsSessionAccount({
    rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
    chainId: "0x534e5f5345504f4c4941",
    session: SESSION,
    sessionPrivateKey: "0x1234",
    policyRoot: "0x5678",
    sessionKeyGuid: SESSION.sessionKeyGuid,
    ...options,
  });
}

describe("TsSessionAccount", () => {
  it("falls back when outside execution throws an explicit error code", async () => {
    const codedError = Object.assign(new Error("authorization service down"), {
      code: "OUTSIDE_EXECUTION",
    });
    const executeFromOutside = vi.fn().mockRejectedValue(codedError);
    const execute = vi.fn().mockResolvedValue({ transaction_hash: "0xfeedbeef" });
    const account = createAccount({ executeFromOutside, execute });

    await expect(account.executeWithFallback(CALLS)).resolves.toEqual({
      transaction_hash: "0xfeedbeef",
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("falls back for exact authorization failure messages", async () => {
    const executeFromOutside = vi
      .fn()
      .mockRejectedValue(new Error("authorization failed"));
    const execute = vi.fn().mockResolvedValue({ transaction_hash: "0xfeedbeef" });
    const account = createAccount({ executeFromOutside, execute });

    await expect(account.executeWithFallback(CALLS)).resolves.toEqual({
      transaction_hash: "0xfeedbeef",
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("falls back for precise outside execution not-implemented messages", async () => {
    const executeFromOutside = vi
      .fn()
      .mockRejectedValue(new Error("not implemented: outside execution"));
    const execute = vi.fn().mockResolvedValue({ transaction_hash: "0xfeedbeef" });
    const account = createAccount({ executeFromOutside, execute });

    await expect(account.executeWithFallback(CALLS)).resolves.toEqual({
      transaction_hash: "0xfeedbeef",
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("does not fallback for unrelated authorization errors", async () => {
    const executeFromOutside = vi
      .fn()
      .mockRejectedValue(new Error("authorization service unavailable"));
    const execute = vi.fn().mockResolvedValue({ transaction_hash: "0xfeedbeef" });
    const account = createAccount({ executeFromOutside, execute });

    await expect(account.executeWithFallback(CALLS)).rejects.toThrow(
      "authorization service unavailable"
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("does not fallback for generic not-implemented errors", async () => {
    const executeFromOutside = vi
      .fn()
      .mockRejectedValue(new Error("callback bridge not implemented"));
    const execute = vi.fn().mockResolvedValue({ transaction_hash: "0xfeedbeef" });
    const account = createAccount({ executeFromOutside, execute });

    await expect(account.executeWithFallback(CALLS)).rejects.toThrow(
      "callback bridge not implemented"
    );
    expect(execute).not.toHaveBeenCalled();
  });
});
