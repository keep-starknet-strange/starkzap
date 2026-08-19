import { afterEach, describe, expect, it, vi } from "vitest";
import { getEventListeners } from "node:events";
import {
  RpcError,
  ec,
  hash as starknetHash,
  shortString,
  type RpcProvider,
  type Signature,
} from "starknet";
import { createEmptyRegistry } from "@starkware-libs/starknet-privacy-sdk";
import {
  Mocknet,
  MockProofInvocationFactory,
  MockProofProvider,
  ContractDiscoveryProvider,
} from "@starkware-libs/starknet-privacy-sdk/testing";
import {
  PROOF_BASE_BLOCK_DEPTH,
  type ProvableAttempt,
  waitForProvableBlock,
  waitForProvableState,
  waitForDeployedAccount,
  waitForFundedBalance,
} from "@/privacy/sequencing";
import { screeningVerdict } from "@/privacy/errors";
import { PrivacyPaymaster, PrivacyPaymasterError } from "@/privacy/paymaster";
import { createPrivacy, revokePrivacy } from "@/privacy/create";
import { signatureDerivation } from "@/privacy/viewing-key";
import { withPaymaster, type PrivateTransfersBuilder } from "@/privacy/client";
import { PrivySigner, StarkSigner } from "@/signer";
import type { SignerInterface } from "@/signer";
import { AccountProvider } from "@/wallet/accounts/provider";
import { ChainId, fromAddress } from "@/types";
import type { Wallet } from "@/wallet";
import { testPrivateKeys } from "./config";

const MAINNET_POOL =
  "0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a";

/** A minimal wallet stub: only what `createPrivacy` reads. */
function walletWith(signer: SignerInterface, address = "0xabc"): Wallet {
  return {
    address: fromAddress(address),
    getChainId: () => ChainId.MAINNET,
    getAccountProvider: () => new AccountProvider(signer),
  } as unknown as Wallet;
}

describe("privacy", () => {
  describe("waitForProvableBlock", () => {
    /** Provider whose head returns each supplied block number in turn. */
    function providerWithHeads(...heads: number[]): RpcProvider {
      const getBlockNumber = vi.fn();
      for (const head of heads) {
        getBlockNumber.mockResolvedValueOnce(head);
      }
      // Keep serving the final head once the script is exhausted.
      getBlockNumber.mockResolvedValue(heads[heads.length - 1]);
      return { getBlockNumber } as unknown as RpcProvider;
    }

    it("returns immediately when the head is already deep enough", async () => {
      const provider = providerWithHeads(120);

      await expect(waitForProvableBlock(provider, 100)).resolves.toBe(
        120 - PROOF_BASE_BLOCK_DEPTH
      );
      expect(provider.getBlockNumber).toHaveBeenCalledTimes(1);
    });

    it("waits until the head advances past the depth window", async () => {
      // 100 is provable only once the head reaches 111.
      const provider = providerWithHeads(105, 108, 111);

      await expect(
        waitForProvableBlock(provider, 100, { pollIntervalMs: 1 })
      ).resolves.toBe(101);
      expect(provider.getBlockNumber).toHaveBeenCalledTimes(3);
    });

    it("treats exactly-at-the-boundary as not yet provable", async () => {
      const provider = providerWithHeads(110, 112);

      await expect(
        waitForProvableBlock(provider, 100, { pollIntervalMs: 1 })
      ).resolves.toBe(102);
      expect(provider.getBlockNumber).toHaveBeenCalledTimes(2);
    });

    it("honours a custom depth", async () => {
      const provider = providerWithHeads(103);

      await expect(
        waitForProvableBlock(provider, 100, { depth: 2 })
      ).resolves.toBe(101);
    });

    it("reports every poll, including the one that succeeds", async () => {
      const provider = providerWithHeads(105, 111);
      const onAttempt = vi.fn();

      await waitForProvableBlock(provider, 100, {
        pollIntervalMs: 1,
        onAttempt,
      });

      expect(onAttempt.mock.calls.map(([a]) => a)).toEqual([
        { attempt: 1, head: 105, provingBlock: 95, ready: false },
        { attempt: 2, head: 111, provingBlock: 101, ready: true },
      ]);
    });

    it("throws when the head never advances far enough", async () => {
      const provider = providerWithHeads(101);

      await expect(
        waitForProvableBlock(provider, 100, {
          pollIntervalMs: 1,
          timeoutMs: 20,
        })
      ).rejects.toThrow(/Timed out after 20ms waiting for block 100/);
    });

    it("rejects at once when the signal is already aborted", async () => {
      // Checked before the first read, so an abort that lands while the caller
      // was setting the wait up costs no RPC call at all.
      const provider = providerWithHeads(120);

      await expect(
        waitForProvableBlock(provider, 100, {
          signal: AbortSignal.abort(new Error("gone")),
        })
      ).rejects.toThrow("gone");
      expect(provider.getBlockNumber).not.toHaveBeenCalled();
    });

    it("rejects mid-wait when the signal aborts, and stops polling", async () => {
      // The head never advances, so without the signal this would poll until
      // `timeoutMs`. The abort has to cut the sleep short, not wait it out.
      const provider = providerWithHeads(101);
      const controller = new AbortController();

      const started = Date.now();
      const wait = waitForProvableBlock(provider, 100, {
        pollIntervalMs: 5_000,
        timeoutMs: 60_000,
        signal: controller.signal,
        onAttempt: () => controller.abort(new Error("disconnected")),
      });

      await expect(wait).rejects.toThrow("disconnected");
      expect(provider.getBlockNumber).toHaveBeenCalledTimes(1);
      // The interval is what proves the abort was not simply slept through: an
      // `abort` event never fires twice, so a listener-only implementation waits
      // the full 5s and then rejects for the same reason at the next loop top.
      expect(Date.now() - started).toBeLessThan(2_000);
    });

    it("leaves no abort listener behind once a wait finishes", async () => {
      // One listener is added per sleep. A wait that polls many times on a
      // long-lived signal would accumulate them until Node warns about a leak,
      // so each sleep has to remove its own on the normal path too.
      const provider = providerWithHeads(105, 108, 111);
      const controller = new AbortController();

      await waitForProvableBlock(provider, 100, {
        pollIntervalMs: 1,
        signal: controller.signal,
      });

      // Three polls, so two sleeps, so two listeners were added and removed.
      expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
    });
  });

  /**
   * The state-based waits exist because counting blocks from a receipt only
   * works for transactions this process saw. An account funded by a transaction
   * it did not send has no receipt here, so the precondition has to be read off
   * chain state instead.
   */
  describe("waitForProvableState", () => {
    function providerWithHeads(...heads: number[]): RpcProvider {
      const getBlockNumber = vi.fn();
      for (const head of heads) getBlockNumber.mockResolvedValueOnce(head);
      getBlockNumber.mockResolvedValue(heads[heads.length - 1]);
      return { getBlockNumber } as unknown as RpcProvider;
    }

    it("returns the proving block once the state is visible there", async () => {
      const provider = providerWithHeads(120);
      const isVisible = vi.fn().mockResolvedValue(true);

      await expect(waitForProvableState(provider, isVisible)).resolves.toBe(
        110
      );
      expect(isVisible).toHaveBeenCalledWith(110);
    });

    it("keeps polling while the state is not visible yet", async () => {
      const provider = providerWithHeads(120, 121, 122);
      const isVisible = vi
        .fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValue(true);

      await expect(
        waitForProvableState(provider, isVisible, { pollIntervalMs: 1 })
      ).resolves.toBe(112);
      expect(isVisible).toHaveBeenCalledTimes(3);
    });

    it("does not probe a negative block on a fresh chain", async () => {
      const provider = providerWithHeads(3, 15);
      const isVisible = vi.fn().mockResolvedValue(true);

      await expect(
        waitForProvableState(provider, isVisible, { pollIntervalMs: 1 })
      ).resolves.toBe(5);
      expect(isVisible).toHaveBeenCalledTimes(1);
      expect(isVisible).toHaveBeenCalledWith(5);
    });

    it("reports every poll, including the one that succeeds", async () => {
      const provider = providerWithHeads(120, 121);
      const onAttempt = vi.fn();

      await waitForProvableState(
        provider,
        vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true),
        { pollIntervalMs: 1, onAttempt }
      );

      expect(onAttempt.mock.calls.map(([a]) => a)).toEqual([
        { attempt: 1, head: 120, provingBlock: 110, ready: false },
        { attempt: 2, head: 121, provingBlock: 111, ready: true },
      ]);
    });

    it("throws when the state never becomes visible", async () => {
      const provider = providerWithHeads(120);

      await expect(
        waitForProvableState(provider, async () => false, {
          pollIntervalMs: 1,
          timeoutMs: 20,
        })
      ).rejects.toThrow(/Timed out waiting for the state a proof depends on/);
    });
  });

  describe("waitForDeployedAccount", () => {
    /** RpcError shape: what `isType` checks is the `baseError.code`. */
    function notFound(): RpcError {
      return new RpcError(
        { code: 20, message: "Contract not found" },
        "starknet_getClassHashAt",
        []
      );
    }

    it("resolves once the class hash is readable at the proving block", async () => {
      const provider = {
        getBlockNumber: vi.fn().mockResolvedValue(120),
        getClassHashAt: vi.fn().mockResolvedValue("0x1"),
      } as unknown as RpcProvider;

      await expect(
        waitForDeployedAccount(provider, fromAddress("0xabc"))
      ).resolves.toBe(110);
      expect(provider.getClassHashAt).toHaveBeenCalledWith(
        fromAddress("0xabc"),
        110
      );
    });

    it("waits while the account is not deployed at that block yet", async () => {
      const provider = {
        getBlockNumber: vi.fn().mockResolvedValue(120),
        getClassHashAt: vi
          .fn()
          .mockRejectedValueOnce(notFound())
          .mockResolvedValue("0x1"),
      } as unknown as RpcProvider;

      await expect(
        waitForDeployedAccount(provider, fromAddress("0xabc"), {
          pollIntervalMs: 1,
        })
      ).resolves.toBe(110);
      expect(provider.getClassHashAt).toHaveBeenCalledTimes(2);
    });

    it("propagates unrelated RPC failures instead of polling forever", async () => {
      const provider = {
        getBlockNumber: vi.fn().mockResolvedValue(120),
        getClassHashAt: vi.fn().mockRejectedValue(new Error("network down")),
      } as unknown as RpcProvider;

      await expect(
        waitForDeployedAccount(provider, fromAddress("0xabc"), {
          pollIntervalMs: 1,
          timeoutMs: 50,
        })
      ).rejects.toThrow("network down");
    });
  });

  describe("waitForFundedBalance", () => {
    const token = {
      address: fromAddress(
        "0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"
      ),
      symbol: "TKN",
      decimals: 18,
      name: "Token",
    } as never;

    function providerReturning(...results: string[][]): RpcProvider {
      const callContract = vi.fn();
      for (const result of results) callContract.mockResolvedValueOnce(result);
      callContract.mockResolvedValue(results[results.length - 1]);
      return {
        getBlockNumber: vi.fn().mockResolvedValue(120),
        callContract,
      } as unknown as RpcProvider;
    }

    it("resolves when the balance at the proving block covers the amount", async () => {
      const provider = providerReturning(["0x64", "0x0"]);

      await expect(
        waitForFundedBalance(provider, token, fromAddress("0xabc"), 100n)
      ).resolves.toBe(110);
      expect(provider.callContract).toHaveBeenCalledWith(
        expect.objectContaining({ entrypoint: "balance_of" }),
        110
      );
    });

    it("waits while the funding transfer has not propagated back that far", async () => {
      // Balance is still 0 at the proving block, then appears.
      const provider = providerReturning(["0x0", "0x0"], ["0x64", "0x0"]);

      await expect(
        waitForFundedBalance(provider, token, fromAddress("0xabc"), 100n, {
          pollIntervalMs: 1,
        })
      ).resolves.toBe(110);
      expect(provider.callContract).toHaveBeenCalledTimes(2);
    });

    it("reads a u256 balance, not just the low felt", async () => {
      // low = 0, high = 1 → 2**128, which a low-only read would see as zero.
      const provider = providerReturning(["0x0", "0x1"]);

      await expect(
        waitForFundedBalance(provider, token, fromAddress("0xabc"), 1n << 127n)
      ).resolves.toBe(110);
    });
  });

  /**
   * The privacy transaction types are not in SNIP-29, so starknet.js's
   * PaymasterRpc cannot express them. These cover the payload shaping and error
   * translation of the client that talks to the paymaster directly.
   */
  describe("PrivacyPaymaster", () => {
    const POOL = fromAddress("0x123");
    const STRK = fromAddress(
      "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"
    );
    const URL = "https://paymaster.example.com";

    /** Stub fetch, returning each body in turn, and record the requests. */
    function stubFetch(...bodies: unknown[]) {
      const calls: unknown[] = [];
      const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
        calls.push(JSON.parse(String(init?.body)));
        const body = bodies.shift();
        return Promise.resolve({
          status: 200,
          ok: true,
          json: () => Promise.resolve(body),
        } as Response);
      });
      vi.stubGlobal("fetch", fetchMock);
      return calls as { method: string; params: Record<string, never> }[];
    }

    /** Await a rejection and hand back the error, typed. */
    function rejectedBy(call: () => Promise<unknown>) {
      return call().then(
        () => {
          throw new Error("expected the paymaster call to reject");
        },
        (e: unknown) => e as PrivacyPaymasterError
      );
    }

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("rejects a paymaster URL that is not http(s)", () => {
      expect(() => new PrivacyPaymaster("ftp://paymaster.example.com")).toThrow(
        "Privacy paymaster URL"
      );
    });

    it("quotes a default-mode fee and returns it in base units", async () => {
      const sent = stubFetch({
        result: {
          fee_action: {
            type: "withdraw",
            recipient: "0x75a1",
            token: STRK,
            amount: "0xe06f18c4533e7800",
          },
          parameters: { version: "0x1", echoed: true },
        },
      });

      const quote = await new PrivacyPaymaster(URL).quote(POOL, {
        mode: "default",
        gasToken: STRK,
      });

      // Validated on the way in, which also normalises: `fromAddress` pads to
      // the canonical 64 hex digits, the same form every other address in
      // starkzap carries. Numerically identical, since the SDK compares
      // addresses as felts.
      expect(quote.feeAction).toEqual({
        recipient: fromAddress("0x75a1"),
        token: fromAddress(STRK),
        amount: 0xe06f18c4533e7800n,
      });
      // Echoed back rather than rebuilt, so a field the service adds survives.
      expect(quote.parameters).toEqual({ version: "0x1", echoed: true });
      expect(sent[0]!.method).toBe("paymaster_buildTransaction");
      expect(sent[0]!.params).toMatchObject({
        transaction: {
          type: "apply_action",
          apply_action: { pool_address: POOL },
        },
        parameters: {
          version: "0x1",
          fee_mode: { mode: "default", gas_token: STRK },
        },
      });
    });

    it("falls back to locally built parameters when the service omits them", async () => {
      stubFetch({
        result: {
          fee_action: { recipient: "0x1", token: STRK, amount: "0x0" },
        },
      });

      const quote = await new PrivacyPaymaster(URL).quote(POOL, {
        mode: "sponsored",
      });

      expect(quote.parameters).toEqual({
        version: "0x1",
        fee_mode: { mode: "sponsored" },
      });
      expect(quote.feeAction.amount).toBe(0n);
    });

    it("names the pool-fee token for sponsored_private and omits tip by default", async () => {
      const sent = stubFetch({
        result: {
          fee_action: { recipient: "0x1", token: STRK, amount: "0x2" },
        },
      });

      await new PrivacyPaymaster(URL).quote(POOL, {
        mode: "sponsored_private",
        poolFeeToken: STRK,
      });

      expect(sent[0]!.params).toMatchObject({
        parameters: {
          fee_mode: { mode: "sponsored_private", pool_fee_token: STRK },
        },
      });
      expect(JSON.stringify(sent[0]!.params).includes("tip")).toBe(false);
    });

    it("submits the call as to/selector/calldata with the proof alongside", async () => {
      const sent = stubFetch({ result: { transaction_hash: "0xabc" } });

      const hash = await new PrivacyPaymaster(URL).execute(
        {
          contractAddress: POOL,
          entrypoint: "apply_actions",
          calldata: ["0x1"],
        },
        { data: "0xproof", proofFacts: ["0xf1", "0xf2"] },
        { version: "0x1", fee_mode: { mode: "sponsored" } }
      );

      expect(hash).toEqual({ transactionHash: "0xabc" });
      expect(sent[0]!.method).toBe("paymaster_executeTransaction");
      expect(sent[0]!.params).toMatchObject({
        transaction: {
          type: "apply_action",
          apply_action: {
            apply_actions_call: {
              to: POOL,
              selector: starknetHash.getSelectorFromName("apply_actions"),
              calldata: ["0x1"],
            },
            proof: "0xproof",
            proof_facts: ["0xf1", "0xf2"],
          },
        },
      });
    });

    it("keeps the relayer's tracking id when it returns one", async () => {
      // Nothing can look one up afterwards, so this response is the only place it
      // ever exists.
      stubFetch({
        result: { transaction_hash: "0xabc", tracking_id: "track-7" },
      });

      await expect(
        new PrivacyPaymaster(URL).execute(
          { contractAddress: POOL, entrypoint: "apply_actions" },
          { data: "0x1", proofFacts: [] },
          { version: "0x1" }
        )
      ).resolves.toEqual({
        transactionHash: "0xabc",
        trackingId: "track-7",
      });
    });

    it("omits the tracking id when the deployment gives none", async () => {
      // It is optional in the response, so absent must not become `undefined`
      // sitting on the object.
      stubFetch({ result: { transaction_hash: "0xabc", tracking_id: "" } });

      const submission = await new PrivacyPaymaster(URL).execute(
        { contractAddress: POOL, entrypoint: "apply_actions" },
        { data: "0x1", proofFacts: [] },
        { version: "0x1" }
      );

      expect(submission).toEqual({ transactionHash: "0xabc" });
      expect("trackingId" in submission).toBe(false);
    });

    it("refuses a result carrying no transaction hash", async () => {
      // `result` is present, so none of the transport guards fire. Without the
      // check the caller receives `undefined` as a successful hash.
      stubFetch({ result: {} });

      await expect(
        new PrivacyPaymaster(URL).execute(
          {
            contractAddress: POOL,
            entrypoint: "apply_actions",
            calldata: ["0x1"],
          },
          { data: "0xproof", proofFacts: [] },
          { version: "0x1", fee_mode: { mode: "sponsored" } }
        )
      ).rejects.toThrow(/no transaction hash/);
    });

    /** Reject with a payload captured verbatim from AVNU's live paymaster. */
    function rejectWith(error: unknown) {
      stubFetch({ error });
      return new PrivacyPaymaster(URL).quote(POOL, { mode: "sponsored" }).then(
        () => {
          throw new Error("expected the paymaster call to reject");
        },
        (e: unknown) => e as PrivacyPaymasterError
      );
    }

    it("surfaces the reason from an object-shaped `data`", async () => {
      // Captured from a build against a non-whitelisted pool. The sentence that
      // names the mistake is inside `data.execution_error`, not `message` —
      // reading only the string form of `data` loses it entirely.
      const error = await rejectWith({
        code: 156,
        message: "An error occurred (TRANSACTION_EXECUTION_ERROR)",
        data: { execution_error: "privacy pool address is not whitelisted" },
      });

      expect(error).toBeInstanceOf(PrivacyPaymasterError);
      expect(error.code).toBe(156);
      expect(error.message).toContain(
        "privacy pool address is not whitelisted"
      );
      // The paymaster's own wording is kept alongside, never replaced by ours.
      expect(error.message).toContain("TRANSACTION_EXECUTION_ERROR");
    });

    it("surfaces the reason from a string `data`", async () => {
      // Captured from a sponsored build with no API key. `163` is SNIP-29's
      // catch-all: it also covers an unavailable service and a blacklisted
      // call, so only `data` can say which happened.
      const error = await rejectWith({
        code: 163,
        message: "An error occurred (UNKNOWN_ERROR)",
        data: "x-paymaster-api-key is invalid",
      });

      expect(error.message).toContain("x-paymaster-api-key is invalid");
      expect(error.message).toContain("UNKNOWN_ERROR");
    });

    it("reports a rejection that carries no `data` at all", async () => {
      // Captured from an execute with unparseable calldata. `message` is all
      // there is, so it has to come through untouched.
      const error = await rejectWith({
        code: 166,
        message: "An error occurred (CALLDATA_PARSING)",
      });

      expect(error.message).toContain("CALLDATA_PARSING");
      // No empty separator left behind by the missing reason.
      expect(error.message).not.toContain("—");
    });

    it("adds advice only where the fix is on starkzap's side", async () => {
      stubFetch({
        error: {
          code: 165,
          message: "An error occurred (MISSING_FEE_TRANSFER_TO)",
        },
      });

      const error = await new PrivacyPaymaster(URL)
        .execute(
          { contractAddress: POOL, entrypoint: "apply_actions" },
          { data: "0x1", proofFacts: [] },
          {}
        )
        .then(
          () => {
            throw new Error("expected the paymaster call to reject");
          },
          (e: unknown) => e as PrivacyPaymasterError
        );

      expect(error.message).toContain("MISSING_FEE_TRANSFER_TO");
      expect(error.message).toContain("`quote()`");
    });

    it("does not attach an execute remedy to a build rejection", async () => {
      // `165` is an execute-only code, and the same number does not mean the
      // same thing on both calls — so advice is keyed by method, not by number.
      const error = await rejectWith({
        code: 165,
        message: "An error occurred (SOMETHING_ELSE)",
      });

      expect(error.message).toContain("SOMETHING_ELSE");
      expect(error.message).not.toContain("quote()");
    });

    it("passes an unrecognised rejection straight through", async () => {
      const error = await rejectWith({
        code: -32601,
        message: "Method not found",
      });

      expect(error.message).toContain("Method not found");
    });

    it("carries the HTTP status as the error code", async () => {
      // The status is the diagnosis when the failure is below the paymaster —
      // 413 from a proxy that caps request bodies, say. It used to be dropped in
      // favour of a synthetic -1, leaving nothing to branch on.
      vi.stubGlobal(
        "fetch",
        vi.fn(() =>
          Promise.resolve({
            status: 413,
            ok: false,
            json: () => Promise.resolve({ error: "Payload Too Large" }),
          } as unknown as Response)
        )
      );

      const error = await rejectedBy(() =>
        new PrivacyPaymaster(URL).quote(POOL, { mode: "sponsored" })
      );

      expect(error.code).toBe(413);
      expect(error.message).toContain("HTTP 413");
    });

    it("reports a non-2xx whose body is the proxy's own JSON shape", async () => {
      // No JSON-RPC `error` member, so this reached neither guard and returned
      // an undefined result — the caller then failed on `result.fee_action`,
      // pointing at the wrong thing entirely.
      vi.stubGlobal(
        "fetch",
        vi.fn(() =>
          Promise.resolve({
            status: 500,
            ok: false,
            json: () => Promise.resolve({ detail: "upstream unavailable" }),
          } as unknown as Response)
        )
      );

      const error = await rejectedBy(() =>
        new PrivacyPaymaster(URL).quote(POOL, { mode: "sponsored" })
      );

      expect(error).toBeInstanceOf(PrivacyPaymasterError);
      expect(error.code).toBe(500);
      // The body is kept so a caller can see what the proxy actually said.
      expect(error.data).toEqual({ detail: "upstream unavailable" });
    });

    it("reports a 2xx carrying neither result nor error", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(() =>
          Promise.resolve({
            status: 200,
            ok: true,
            json: () => Promise.resolve({}),
          } as unknown as Response)
        )
      );

      await expect(
        new PrivacyPaymaster(URL).quote(POOL, { mode: "sponsored" })
      ).rejects.toThrow("returned no result");
    });

    it("reports a non-JSON response rather than an opaque parse error", async () => {
      // What a proxy in front of the paymaster returns when it fails first.
      vi.stubGlobal(
        "fetch",
        vi.fn(() =>
          Promise.resolve({
            status: 502,
            json: () => Promise.reject(new Error("not json")),
          } as unknown as Response)
        )
      );

      await expect(
        new PrivacyPaymaster(URL).quote(POOL, { mode: "sponsored" })
      ).rejects.toThrow("non-JSON response (HTTP 502)");
    });

    it("refuses to build a proof it knows the paymaster will reject", async () => {
      // No fee action means there is no way to satisfy the forwarder.
      stubFetch({ result: { parameters: {} } });

      await expect(
        new PrivacyPaymaster(URL).quote(POOL, { mode: "sponsored" })
      ).rejects.toThrow("returned no fee action");
    });

    /**
     * A proxy that holds the API key is itself worth gating, and gating it needs
     * a credential. Rather than growing a field per concern, the transport is
     * replaceable — so auth, retries, timeouts and tracing all compose in the
     * caller, while reading the response stays here.
     */
    describe("transport override", () => {
      it("uses the supplied fetch, and keeps interpreting the response", async () => {
        const seen: RequestInit[] = [];
        const mine: typeof fetch = (_input, init) => {
          seen.push(init as RequestInit);
          return Promise.resolve({
            status: 200,
            ok: true,
            json: () =>
              Promise.resolve({
                error: {
                  code: 163,
                  message: "An error occurred (UNKNOWN_ERROR)",
                },
              }),
          } as Response);
        };
        // The global stays stubbed to prove the override is what ran.
        stubFetch({ result: {} });

        const error = await rejectedBy(() =>
          new PrivacyPaymaster(URL, { fetch: mine }).quote(POOL, {
            mode: "sponsored",
          })
        );

        expect(seen).toHaveLength(1);
        // Our own guards still ran on the wrapper's response.
        expect(error.code).toBe(163);
      });

      it("lets a wrapper add headers the client has no field for", async () => {
        let authorization: string | undefined;
        const mine: typeof fetch = (_input, init) => {
          authorization = (init?.headers as Record<string, string>)[
            "Authorization"
          ];
          return Promise.resolve({
            status: 200,
            ok: true,
            json: () =>
              Promise.resolve({ result: { transaction_hash: "0x1" } }),
          } as Response);
        };

        const paymaster = new PrivacyPaymaster(URL, {
          fetch: (input, init) =>
            mine(input, {
              ...init,
              headers: { ...init?.headers, Authorization: "Bearer secret" },
            }),
        });
        await paymaster.execute(
          { contractAddress: POOL, entrypoint: "apply_actions" },
          { data: "0x1", proofFacts: [] },
          {}
        );

        expect(authorization).toBe("Bearer secret");
      });

      it("falls back to the global fetch when none is supplied", async () => {
        const sent = stubFetch({
          result: {
            fee_action: { recipient: "0x75a1", token: STRK, amount: "0x0" },
            parameters: {},
          },
        });

        await new PrivacyPaymaster(URL).quote(POOL, { mode: "sponsored" });

        expect(sent[0]!.method).toBe("paymaster_buildTransaction");
      });
    });

    /**
     * `invoke_and_apply_action` relays user calls — an ERC20 `approve`, usually —
     * in the same transaction as the pool action, instead of leaving them as a
     * separate public transaction the user pays for. The paymaster answers with
     * SNIP-12 typed data for the user to sign.
     *
     * Shapes here are the ones mainnet actually returned when probed.
     */
    describe("relaying user calls", () => {
      const USER = fromAddress("0x7dbc0");
      // Decimal calldata on purpose: this is what `CallData.compile` produces, so
      // it is what every call from `wallet.tx()` and the ERC20 helpers carries. A
      // fixture without calldata cannot catch the paymaster rejecting unprefixed
      // felts, which is exactly how that shipped once.
      const APPROVE = {
        contractAddress: POOL,
        entrypoint: "approve",
        calldata: ["1000000000000000000", "0"],
      };
      // Faithful to a real response: the caller is the forwarder that collects
      // the fee, and the calls are the requested ones in the paymaster's own
      // to/selector/calldata shape. A fixture with an empty message cannot catch
      // typed data that authorises something else.
      const TYPED_DATA = {
        types: {},
        domain: {
          name: "Account.execute_from_outside",
          version: "1",
          chainId: "SN_MAIN",
        },
        primaryType: "OutsideExecution",
        message: {
          Caller: "0x75a1",
          Nonce: "0xd81715a5eb341fbc984610847b7f9826",
          "Execute After": "0x1",
          "Execute Before": `0x${(Math.floor(Date.now() / 1000) + 3600).toString(16)}`,
          Calls: [
            {
              To: POOL,
              Selector: starknetHash.getSelectorFromName("approve"),
              Calldata: ["0xde0b6b3a7640000", "0x0"],
            },
          ],
        },
      };
      const quoted = (over: Record<string, unknown> = {}) => ({
        result: {
          fee_action: { recipient: "0x75a1", token: STRK, amount: "0xa" },
          typed_data: TYPED_DATA,
          parameters: {},
          ...over,
        },
      });

      it("asks for the wrapped type and returns the data to sign", async () => {
        const sent = stubFetch(quoted());

        const quote = await new PrivacyPaymaster(URL).quote(
          POOL,
          { mode: "sponsored" },
          {
            invoke: { userAddress: USER, calls: [APPROVE], chainId: "SN_MAIN" },
          }
        );

        expect(sent[0]!.params).toMatchObject({
          transaction: {
            type: "invoke_and_apply_action",
            apply_action: { pool_address: POOL },
            invoke: { user_address: USER },
          },
        });
        // Calls go over in the paymaster's shape: a selector, not an entrypoint.
        const call = (
          sent[0]!.params as unknown as {
            transaction: {
              invoke: {
                calls: { to: string; selector: string; calldata: string[] }[];
              };
            };
          }
        ).transaction.invoke.calls[0]!;
        expect(call.to).toBe(POOL);
        expect(call.selector).toBe(starknetHash.getSelectorFromName("approve"));
        // Every felt 0x-prefixed, values preserved. The paymaster answers
        // `-32602 Invalid params` for a bare decimal, so this is not cosmetic.
        expect(call.calldata).toEqual(["0xde0b6b3a7640000", "0x0"]);
        expect(quote.typedData).toEqual(TYPED_DATA);
      });

      /**
       * The response decides what the account will execute, so each of these is a
       * substitution a compromised or misconfigured endpoint could attempt. The
       * quote has to refuse before the caller ever sees something to sign.
       */
      describe("refuses typed data that does not match the request", () => {
        const tamper = (message: Record<string, unknown>) =>
          rejectedBy(() => {
            stubFetch(
              quoted({
                typed_data: {
                  ...TYPED_DATA,
                  message: { ...TYPED_DATA.message, ...message },
                },
              })
            );
            return new PrivacyPaymaster(URL).quote(
              POOL,
              { mode: "sponsored" },
              {
                invoke: {
                  userAddress: USER,
                  calls: [APPROVE],
                  chainId: "SN_MAIN",
                },
              }
            );
          });

        const oneCall = (call: Record<string, unknown>) => ({
          Calls: [{ ...TYPED_DATA.message.Calls[0], ...call }],
        });

        it("rejects a substituted target", async () => {
          const error = await tamper(oneCall({ To: "0xdead" }));
          expect(error.message).toMatch(/call 0 targets 0xdead/);
        });

        it("rejects a substituted selector", async () => {
          const error = await tamper(
            oneCall({ Selector: starknetHash.getSelectorFromName("transfer") })
          );
          expect(error.message).toMatch(/call 0 runs selector/);
        });

        it("rejects altered calldata", async () => {
          const error = await tamper(
            oneCall({ Calldata: ["0xde0b6b3a7640000", "0x1"] })
          );
          expect(error.message).toMatch(/calldata differs at position 1/);
        });

        it("rejects an extra call smuggled alongside ours", async () => {
          const error = await tamper({
            Calls: [
              TYPED_DATA.message.Calls[0],
              { To: "0xdead", Selector: "0x1", Calldata: [] },
            ],
          });
          expect(error.message).toMatch(/carries 2 calls, not the 1 requested/);
        });

        it("rejects a caller that is not the fee's forwarder", async () => {
          const error = await tamper({ Caller: "0xdead" });
          expect(error.message).toMatch(/the caller is 0xdead/);
        });

        it("rejects typed data that has already expired", async () => {
          const error = await tamper({ "Execute Before": "0x1" });
          expect(error.message).toMatch(/expired at 1/);
        });

        it("rejects typed data with no expiry at all", async () => {
          const error = await tamper({ "Execute Before": undefined });
          expect(error.message).toMatch(/no readable `Execute Before`/);
        });

        it("rejects typed data bound to another chain", async () => {
          // The account hashes the message with the chain it runs on, so this
          // signature would fail here and stay valid on the chain named instead --
          // where the same account address usually exists.
          const error = await rejectedBy(() => {
            stubFetch(
              quoted({
                typed_data: {
                  ...TYPED_DATA,
                  domain: { ...TYPED_DATA.domain, chainId: "SN_SEPOLIA" },
                },
              })
            );
            return new PrivacyPaymaster(URL).quote(
              POOL,
              { mode: "sponsored" },
              {
                invoke: {
                  userAddress: USER,
                  calls: [APPROVE],
                  chainId: "SN_MAIN",
                },
              }
            );
          });
          expect(error.message).toMatch(
            /bound to chain SN_SEPOLIA, not SN_MAIN/
          );
        });

        it("accepts a chain given as a felt rather than a literal", async () => {
          stubFetch(
            quoted({
              typed_data: {
                ...TYPED_DATA,
                domain: {
                  ...TYPED_DATA.domain,
                  chainId: shortString.encodeShortString("SN_MAIN"),
                },
              },
            })
          );

          const quote = await new PrivacyPaymaster(URL).quote(
            POOL,
            { mode: "sponsored" },
            {
              invoke: {
                userAddress: USER,
                calls: [APPROVE],
                chainId: "SN_MAIN",
              },
            }
          );

          expect(quote.typedData).toBeDefined();
        });

        it("rejects a primary type that is not an outside execution", async () => {
          const error = await rejectedBy(() => {
            stubFetch(
              quoted({ typed_data: { ...TYPED_DATA, primaryType: "Transfer" } })
            );
            return new PrivacyPaymaster(URL).quote(
              POOL,
              { mode: "sponsored" },
              {
                invoke: {
                  userAddress: USER,
                  calls: [APPROVE],
                  chainId: "SN_MAIN",
                },
              }
            );
          });
          expect(error.message).toMatch(/primary type is "Transfer"/);
        });
      });

      it("asks for the plain type, and returns no typed data, without it", async () => {
        const sent = stubFetch(quoted({ typed_data: undefined }));

        const quote = await new PrivacyPaymaster(URL).quote(POOL, {
          mode: "sponsored",
        });

        expect(sent[0]!.params).toMatchObject({
          transaction: { type: "apply_action" },
        });
        expect(quote.typedData).toBeUndefined();
      });

      it("names the account requirement rather than echoing `invalid version`", async () => {
        // What mainnet answers for an address that cannot do outside execution.
        // Reads as a version bug in this client; it is a fact about the account.
        stubFetch({
          error: {
            code: 156,
            message: "An error occurred (TRANSACTION_EXECUTION_ERROR)",
            data: { execution_error: "invalid version" },
          },
        });

        const error = await rejectedBy(() =>
          new PrivacyPaymaster(URL).quote(
            POOL,
            { mode: "sponsored" },
            {
              invoke: {
                userAddress: USER,
                calls: [APPROVE],
                chainId: "SN_MAIN",
              },
            }
          )
        );

        expect(error.message).toContain("outside execution (SNIP-9)");
        expect(error.message).toContain(USER);
      });

      it("leaves `invalid version` alone when no calls were wrapped", async () => {
        // Same code and reason, but nothing was being relayed — so the account
        // requirement is not the explanation and must not be asserted.
        stubFetch({
          error: {
            code: 156,
            message: "An error occurred (TRANSACTION_EXECUTION_ERROR)",
            data: { execution_error: "invalid version" },
          },
        });

        const error = await rejectedBy(() =>
          new PrivacyPaymaster(URL).quote(POOL, { mode: "sponsored" })
        );

        expect(error.message).toContain("invalid version");
        expect(error.message).not.toContain("SNIP-9");
      });

      it("refuses a wrapped quote the paymaster did not authorise", async () => {
        // Accepted the type but sent no typed data: submitting would fail after
        // the proof has already been paid for.
        stubFetch(quoted({ typed_data: undefined }));

        const error = await rejectedBy(() =>
          new PrivacyPaymaster(URL).quote(
            POOL,
            { mode: "sponsored" },
            {
              invoke: {
                userAddress: USER,
                calls: [APPROVE],
                chainId: "SN_MAIN",
              },
            }
          )
        );

        expect(error.message).toContain("no `typed_data`");
      });

      it("submits the signed calls alongside the proof", async () => {
        const sent = stubFetch({ result: { transaction_hash: "0xsent" } });

        await new PrivacyPaymaster(URL).execute(
          { contractAddress: POOL, entrypoint: "apply_actions" },
          { data: "0x1", proofFacts: ["0x2"] },
          { version: "0x1" },
          {
            userAddress: USER,
            typedData: TYPED_DATA,
            signature: ["0x3", "0x4"],
          }
        );

        expect(sent[0]!.params).toMatchObject({
          transaction: {
            type: "invoke_and_apply_action",
            // Echoed unchanged: the signature covers these exact bytes.
            invoke: {
              user_address: USER,
              typed_data: TYPED_DATA,
              signature: ["0x3", "0x4"],
            },
          },
        });
      });
    });

    /**
     * The gas figures are what make the cost explicable: `default` mode charges
     * the suggested maximum, not the estimate, and the gap is what a user pays
     * for without using. They used to be dropped on the floor.
     */
    describe("gas figures", () => {
      /** The `fee` block as mainnet returned it, hex and all. */
      const FEE_BLOCK = {
        gas_token_price_in_strk: "0xde0b6b3a7640000",
        estimated_fee_in_strk: "0x43b905c161c88000",
        estimated_fee_in_gas_token: "0x27f7985a13008000",
        suggested_max_fee_in_strk: "0x10b8eff83c0cb0000",
        suggested_max_fee_in_gas_token: "0x10b8eff83c0cb0000",
      };
      const withFee = (fee?: unknown) => ({
        result: {
          fee_action: { recipient: "0x75a1", token: STRK, amount: "0xa" },
          ...(fee !== undefined && { fee }),
          parameters: {},
        },
      });

      it("reports the estimate alongside what will actually be withdrawn", async () => {
        stubFetch(withFee(FEE_BLOCK));

        const { gas } = await new PrivacyPaymaster(URL).quote(POOL, {
          mode: "sponsored",
        });

        // ~4.88 STRK expected, ~19.28 charged: the spread a caller should show.
        expect(gas?.estimatedInStrk).toBe(0x43b905c161c88000n);
        expect(gas?.suggestedMaxInStrk).toBe(0x10b8eff83c0cb0000n);
        expect(gas?.suggestedMaxInGasToken).toBe(0x10b8eff83c0cb0000n);
        expect(gas?.gasTokenPriceInStrk).toBe(0xde0b6b3a7640000n);
      });

      it("omits them when the deployment sends none", async () => {
        stubFetch(withFee(undefined));

        const quote = await new PrivacyPaymaster(URL).quote(POOL, {
          mode: "sponsored",
        });

        expect(quote.gas).toBeUndefined();
        // The fee itself is unaffected — these are for display only.
        expect(quote.feeAction.amount).toBe(10n);
      });

      it("does not fail a quote over an unreadable figure", async () => {
        stubFetch(
          withFee({ ...FEE_BLOCK, suggested_max_fee_in_strk: "not-a-number" })
        );

        const quote = await new PrivacyPaymaster(URL).quote(POOL, {
          mode: "sponsored",
        });

        expect(quote.gas).toBeUndefined();
        expect(quote.feeAction.amount).toBe(10n);
      });
    });

    /**
     * The response decides which address receives how much of the caller's
     * shielded balance, and the proof then commits to it — so it is validated
     * on the way in rather than cast and trusted.
     */
    describe("fee action validation", () => {
      const feeAction = (over: Record<string, string>) => ({
        result: {
          fee_action: {
            recipient: "0x75a1",
            token: "0x1",
            amount: "0xa",
            ...over,
          },
          parameters: {},
        },
      });

      /**
       * The fee leaves the caller's shielded balance, so the token it is
       * denominated in is part of what the user agreed to. In the two modes where
       * the caller names that token, a quote naming a different one is refused.
       * Under `sponsored` the deployment picks it, so `maxFee` is the only bound.
       */
      it("rejects a fee token other than the configured gas token", async () => {
        stubFetch(feeAction({ token: STRK }));

        const error = await rejectedBy(() =>
          new PrivacyPaymaster(URL).quote(POOL, {
            mode: "default",
            gasToken: fromAddress("0xe7"),
          })
        );

        expect(error.message).toMatch(/quoted its fee in/);
        expect(error.message).toMatch(
          /`default` mode was configured to pay in/
        );
      });

      it("rejects a fee token other than the configured pool fee token", async () => {
        stubFetch(feeAction({ token: STRK }));

        const error = await rejectedBy(() =>
          new PrivacyPaymaster(URL).quote(POOL, {
            mode: "sponsored_private",
            poolFeeToken: fromAddress("0xe7"),
          })
        );

        expect(error.message).toMatch(/`sponsored_private` mode/);
      });

      it("accepts whichever token the deployment picks under sponsored", async () => {
        stubFetch(feeAction({ token: STRK }));

        const quote = await new PrivacyPaymaster(URL).quote(POOL, {
          mode: "sponsored",
        });

        expect(quote.feeAction.token).toBe(fromAddress(STRK));
      });

      /**
       * Nothing on chain says which fee recipient is legitimate, so this is the
       * only way to bind it to something the paymaster does not control.
       */
      describe("allowedFeeRecipients", () => {
        it("accepts a recipient on the list", async () => {
          stubFetch(feeAction({ recipient: "0x75a1" }));

          const quote = await new PrivacyPaymaster(URL, {
            allowedFeeRecipients: [
              fromAddress("0xdead"),
              fromAddress("0x75a1"),
            ],
          }).quote(POOL, { mode: "sponsored" });

          expect(quote.feeAction.recipient).toBe(fromAddress("0x75a1"));
        });

        it("refuses a recipient that is not on the list", async () => {
          stubFetch(feeAction({ recipient: "0xdead" }));

          const error = await rejectedBy(() =>
            new PrivacyPaymaster(URL, {
              allowedFeeRecipients: [fromAddress("0x75a1")],
            }).quote(POOL, { mode: "sponsored" })
          );

          expect(error.message).toMatch(/not in `allowedFeeRecipients`/);
          expect(error.message).toMatch(/Nothing was withdrawn/);
        });

        it("compares by value, so padding does not matter", async () => {
          // An integrator pastes an address in whatever form they have it.
          stubFetch(feeAction({ recipient: "0x75a1" }));

          const quote = await new PrivacyPaymaster(URL, {
            allowedFeeRecipients: [
              `0x${"0".repeat(60)}75a1` as unknown as ReturnType<
                typeof fromAddress
              >,
            ],
          }).quote(POOL, { mode: "sponsored" });

          expect(quote.feeAction.recipient).toBe(fromAddress("0x75a1"));
        });

        it("names an empty list rather than blaming the quote", async () => {
          stubFetch(feeAction({ recipient: "0x75a1" }));

          const error = await rejectedBy(() =>
            new PrivacyPaymaster(URL, { allowedFeeRecipients: [] }).quote(
              POOL,
              {
                mode: "sponsored",
              }
            )
          );

          expect(error.message).toMatch(/is an empty list/);
        });

        it("accepts any recipient when left unset", async () => {
          stubFetch(feeAction({ recipient: "0xdead" }));

          const quote = await new PrivacyPaymaster(URL).quote(POOL, {
            mode: "sponsored",
          });

          expect(quote.feeAction.recipient).toBe(fromAddress("0xdead"));
        });
      });

      it("rejects a recipient that is not an address", async () => {
        stubFetch(feeAction({ recipient: "not-an-address" }));

        await expect(
          new PrivacyPaymaster(URL).quote(POOL, { mode: "sponsored" })
        ).rejects.toThrow("fee action starkzap cannot use");
      });

      it("rejects an amount that is not a number", async () => {
        // Would otherwise surface as a bare BigInt SyntaxError from inside a
        // quote, naming neither the paymaster nor the field.
        stubFetch(feeAction({ amount: "twelve" }));

        await expect(
          new PrivacyPaymaster(URL).quote(POOL, { mode: "sponsored" })
        ).rejects.toThrow("fee action starkzap cannot use");
      });

      it("rejects a fee above the configured ceiling", async () => {
        stubFetch(feeAction({ amount: "0xb" }));

        await expect(
          new PrivacyPaymaster(URL, { maxFee: 10n }).quote(POOL, {
            mode: "sponsored",
          })
        ).rejects.toThrow(
          /quoted a fee of 11 base units .*above the 10 ceiling/
        );
      });

      it("allows a fee exactly at the ceiling", async () => {
        stubFetch(feeAction({ amount: "0xa" }));

        const { feeAction: action } = await new PrivacyPaymaster(URL, {
          maxFee: 10n,
        }).quote(POOL, { mode: "sponsored" });
        expect(action.amount).toBe(10n);
      });

      it("has no ceiling unless one is configured", async () => {
        stubFetch(feeAction({ amount: "0xde0b6b3a7640000" }));

        const { feeAction: action } = await new PrivacyPaymaster(URL).quote(
          POOL,
          { mode: "sponsored" }
        );
        expect(action.amount).toBe(1_000_000_000_000_000_000n);
      });
    });
  });

  describe("screeningVerdict", () => {
    /** Shape of the proving service's JSON-RPC error. */
    function provingError(code: number, data?: string) {
      return Object.assign(new Error(`rpc ${code}`), { code, data });
    }

    /**
     * `screeningVerdict` reimplements the SDK's own mapper so a catch block never
     * has to load an optional dependency. The SDK calls those reason strings "a
     * wire contract… keep both sides in sync", and there are now two copies — so
     * this compares them instead of trusting that they still agree.
     */
    it("agrees with the SDK's own mapper on every verdict", async () => {
      const { screeningErrorFromProvingError, ScreeningRejected } =
        await import("@starkware-libs/starknet-privacy-sdk");

      const cases = [
        ["address_blocked", "rejected"],
        ["screening_unavailable", "unavailable"],
        ["something_else", undefined],
      ] as const;

      for (const [data, expected] of cases) {
        const error = provingError(10000, data);
        const theirs = screeningErrorFromProvingError(
          error as unknown as Parameters<
            typeof screeningErrorFromProvingError
          >[0]
        );
        const ours = screeningVerdict(error);

        expect(ours).toBe(expected);
        // Same call, same conclusion: both classify, or both decline to.
        expect(theirs === undefined).toBe(ours === undefined);
        if (ours === "rejected") {
          expect(theirs).toBeInstanceOf(ScreeningRejected);
        }
      }
    });

    it("classifies a sanctions block as terminal", () => {
      expect(screeningVerdict(provingError(10000, "address_blocked"))).toBe(
        "rejected"
      );
    });

    it("classifies an unreachable screener as transient", () => {
      expect(
        screeningVerdict(provingError(10000, "screening_unavailable"))
      ).toBe("unavailable");
    });

    it("ignores code 10000 with an unrecognised reason", () => {
      // The interceptor also emits 10000 for non-pool transactions and for its
      // own unhandled exceptions, passing the raw message as `data`. Reporting
      // those as a sanctions hit would tell the user never to retry a failure
      // that is actually transient.
      expect(
        screeningVerdict(
          provingError(10000, "Cannot read property 'x' of undefined")
        )
      ).toBeUndefined();
      expect(screeningVerdict(provingError(10000))).toBeUndefined();
    });

    it("ignores other proving service errors", () => {
      expect(screeningVerdict(provingError(-32005, "busy"))).toBeUndefined();
      expect(screeningVerdict(provingError(61, "Unsupported tx version"))).toBe(
        undefined
      );
    });

    it("ignores non-error values", () => {
      expect(screeningVerdict(undefined)).toBeUndefined();
      expect(screeningVerdict(null)).toBeUndefined();
      expect(screeningVerdict("address_blocked")).toBeUndefined();
      expect(screeningVerdict(new Error("boom"))).toBeUndefined();
    });
  });

  describe("createPrivacy", () => {
    /** A signer that makes no determinism claim. */
    class ForeignSigner implements SignerInterface {
      readonly deterministic?: boolean;

      getPubKey(): Promise<string> {
        return Promise.resolve("0x1");
      }
      signRaw(): Promise<Signature> {
        return Promise.resolve(["0x1", "0x2"]);
      }
    }

    const config = {
      poolContractAddress: MAINNET_POOL,
      prover: "https://prover.example.com",
      discovery: "https://discovery.example.com",
    };

    it("rejects a wallet whose signer is not a StarkSigner", async () => {
      await expect(
        createPrivacy(walletWith(new ForeignSigner()), config)
      ).rejects.toThrow("requires a signer that declares");
    });

    it("rejects a Privy signer, which makes no determinism claim", async () => {
      // The concrete case the gate exists for. `PrivySigner` satisfies
      // starkzap's SignerInterface, so nothing but this check stops it — and
      // `rawSign` delegates to a remote service whose ECDSA nonce policy we
      // cannot verify. A non-deterministic signature would derive a different
      // viewing key per login and orphan every existing note.
      const privy = new PrivySigner({
        walletId: "wallet-1",
        publicKey: "0x1",
        rawSign: () => Promise.resolve(`0x${"ab".repeat(64)}`),
      });

      await expect(createPrivacy(walletWith(privy), config)).rejects.toThrow(
        "requires a signer that declares"
      );
    });

    it("checks the signer before doing any network-shaped work", async () => {
      const signer = new ForeignSigner();
      const signRaw = vi.spyOn(signer, "signRaw");

      await expect(createPrivacy(walletWith(signer), config)).rejects.toThrow();
      expect(signRaw).not.toHaveBeenCalled();
    });

    it("accepts any signer that declares determinism", async () => {
      // The point of the property over an `instanceof StarkSigner` check: a
      // custom signer that genuinely is RFC-6979 can opt in, and the claim
      // survives two copies of starkzap in one dependency tree.
      class DeterministicSigner extends ForeignSigner {
        override readonly deterministic = true;
      }

      // Reaching URL validation proves the signer gate let it through.
      await expect(
        createPrivacy(walletWith(new DeterministicSigner()), {
          ...config,
          prover: "ftp://prover.example.com",
        })
      ).rejects.toThrow("Privacy proving service URL must use");
    });

    it("warns when a service URL is plain http, and not when it is https", async () => {
      // Both services receive the viewing key, so cleartext exposes it. Warned
      // rather than thrown: http is allowed on purpose for local development.
      const warn = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);
      try {
        await createPrivacy(walletWith(new StarkSigner(testPrivateKeys.key1)), {
          ...config,
          prover: "https://prover.example.com",
          discovery: "http://discovery.example.com",
        });

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0]![0]).toContain("discovery service URL");
        expect(warn.mock.calls[0]![0]).toContain("readable in transit");
      } finally {
        warn.mockRestore();
      }
    });

    it("rejects unsafe service URLs", async () => {
      const wallet = walletWith(new StarkSigner(testPrivateKeys.key1));

      await expect(
        createPrivacy(wallet, { ...config, prover: "ftp://prover.example.com" })
      ).rejects.toThrow(
        "Privacy proving service URL must use http:// or https://"
      );

      await expect(
        createPrivacy(wallet, { ...config, discovery: "not a url" })
      ).rejects.toThrow("Privacy discovery service URL must be a valid URL");
    });

    /**
     * Discovery is the only service the viewing key is ever sent to, so it is
     * the one that most needs the OHTTP envelope. An OHTTP-enabled provider
     * fetches the server's HPKE key config from `GET /ohttp-keys` before it
     * will send anything, which makes the envelope observable from outside.
     */
    describe("ohttp", () => {
      /** Records every URL fetched, and fails the key-config fetch. */
      function recordFetches(): string[] {
        const urls: string[] = [];
        vi.stubGlobal(
          "fetch",
          vi.fn((input: unknown) => {
            urls.push(String(input));
            return Promise.resolve({
              ok: false,
              status: 503,
              json: () => Promise.reject(new Error("not json")),
              arrayBuffer: () => Promise.reject(new Error("no body")),
            } as unknown as Response);
          })
        );
        return urls;
      }

      afterEach(() => {
        vi.unstubAllGlobals();
      });

      async function discoverWith(ohttp: boolean | undefined) {
        const urls = recordFetches();
        const transfers = await createPrivacy(
          walletWith(new StarkSigner(testPrivateKeys.key1)),
          {
            ...config,
            discovery: "https://discovery.example.com",
            ...(ohttp !== undefined && { ohttp }),
          }
        );
        // The stubbed transport fails; only the attempted URLs matter.
        await transfers.discoverNotes().catch(() => undefined);
        return urls;
      }

      it("wraps the discovery service when enabled", async () => {
        const urls = await discoverWith(true);

        expect(urls.some((u) => u.includes("/ohttp-keys"))).toBe(true);
      });

      it("talks to the discovery service directly when not enabled", async () => {
        const urls = await discoverWith(undefined);

        expect(urls.some((u) => u.includes("/ohttp-keys"))).toBe(false);
        expect(urls.some((u) => u.includes("discovery.example.com"))).toBe(
          true
        );
      });

      it("tolerates a trailing slash on the service URL", async () => {
        const urls = recordFetches();
        const transfers = await createPrivacy(
          walletWith(new StarkSigner(testPrivateKeys.key1)),
          {
            ...config,
            discovery: "https://discovery.example.com/",
            ohttp: true,
          }
        );
        await transfers.discoverNotes().catch(() => undefined);

        expect(urls).toContain("https://discovery.example.com/ohttp-keys");
        expect(urls.some((u) => u.includes("//ohttp-keys"))).toBe(false);
      });

      it("rejects a relay URL that is not http or https", async () => {
        await expect(
          createPrivacy(walletWith(new StarkSigner(testPrivateKeys.key1)), {
            ...config,
            discovery: "https://discovery.example.com",
            ohttp: { relayUrl: "ftp://relay.example.com" },
          })
        ).rejects.toThrow(
          "Privacy OHTTP relay URL must use http:// or https://"
        );
      });
    });
  });

  describe("against the SDK's mocks", () => {
    const POOL_ADDRESS = 0x123n;
    const POOL_HEX = `0x${POOL_ADDRESS.toString(16)}`;

    /**
     * Wires the privacy SDK's in-memory mocks (no chain, no prover, no
     * discovery service) to a stub wallet, so the flow exercises starkzap's
     * glue: viewing-key derivation, the SignerAdapter bridge, and provider
     * instance passthrough.
     */
    function mockEnv() {
      const mocknet = new Mocknet({ poolAddress: POOL_ADDRESS });
      const env = mocknet.initialize();

      // Use alice's address so the mocknet's pre-funded token balances apply.
      const wallet = walletWith(
        new StarkSigner(testPrivateKeys.key1),
        `0x${env.alice.address.toString(16)}`
      );

      const create = () =>
        createPrivacy(wallet, {
          poolContractAddress: POOL_HEX,
          prover: new MockProofProvider(mocknet.pool),
          discovery: new ContractDiscoveryProvider(mocknet.pool),
          proofInvocationFactory: new MockProofInvocationFactory(),
        });

      return { mocknet, env, wallet, create };
    }

    /**
     * The viewing key lives in a closure inside the client, so dropping a cached
     * reference elsewhere does not end it. Revocation cuts it off at the source —
     * and because the SDK asks for the key on every operation rather than
     * caching it, that ends every call which needs to decrypt.
     */
    describe("revokePrivacy", () => {
      it("refuses to decrypt after being revoked", async () => {
        const { create } = mockEnv();
        const transfers = await create();

        // Works beforehand, so the failure afterwards is the revocation and not
        // a broken fixture.
        await expect(transfers.discoverNotes()).resolves.toBeDefined();

        revokePrivacy(transfers);

        await expect(transfers.discoverNotes()).rejects.toThrow(
          "privacy client was revoked"
        );
      });

      it("refuses a key whose derivation finished after revocation", async () => {
        const { mocknet, wallet } = mockEnv();
        let release = (): void => {};
        const suspended = new Promise<void>((resolve) => {
          release = resolve;
        });

        const transfers = await createPrivacy(wallet, {
          poolContractAddress: POOL_HEX,
          prover: new MockProofProvider(mocknet.pool),
          discovery: new ContractDiscoveryProvider(mocknet.pool),
          proofInvocationFactory: new MockProofInvocationFactory(),
          viewingKeyDerivation: async () => {
            await suspended;
            return "0x1";
          },
        });

        // Revocation lands while the derivation is still waiting, which is the
        // window a check taken only before the await would miss.
        const pending = transfers.discoverNotes();
        revokePrivacy(transfers);
        release();

        await expect(pending).rejects.toThrow("privacy client was revoked");
      });

      it("derives once for callers arriving together", async () => {
        const { mocknet, wallet } = mockEnv();
        const derivations = vi.fn().mockResolvedValue("0x1");

        const transfers = await createPrivacy(wallet, {
          poolContractAddress: POOL_HEX,
          prover: new MockProofProvider(mocknet.pool),
          discovery: new ContractDiscoveryProvider(mocknet.pool),
          proofInvocationFactory: new MockProofInvocationFactory(),
          viewingKeyDerivation: derivations,
        });

        await Promise.all([
          transfers.discoverNotes(),
          transfers.discoverNotes(),
          transfers.discoverNotes(),
        ]);

        // Each derivation asks the signer to sign, so repeating it would prompt
        // the user once per concurrent call.
        expect(derivations).toHaveBeenCalledTimes(1);
      });

      it("leaves other clients alone", async () => {
        const { create } = mockEnv();
        const [first, second] = await Promise.all([create(), create()]);

        revokePrivacy(first);

        await expect(first.discoverNotes()).rejects.toThrow("was revoked");
        await expect(second.discoverNotes()).resolves.toBeDefined();
      });

      it("is safe to call twice, and on an unused client", () => {
        const { create } = mockEnv();
        return create().then((transfers) => {
          expect(() => {
            revokePrivacy(transfers);
            revokePrivacy(transfers);
          }).not.toThrow();
        });
      });
    });

    it("registers, then reports the account as ready to transact", async () => {
      const { mocknet, env, create } = mockEnv();
      const transfers = await create();

      expect(mocknet.pool.is_registered(env.alice.address)).toBe(false);

      mocknet.executeOutside(await transfers.build().register().execute());

      expect(mocknet.pool.is_registered(env.alice.address)).toBe(true);
    });

    it("registers with the viewing key derived from the wallet's signer", async () => {
      const { mocknet, env, wallet, create } = mockEnv();
      const transfers = await create();

      mocknet.executeOutside(await transfers.build().register().execute());

      // The key the pool stores must be the one starkzap derives from the
      // signer, not one the SDK generated on its own.
      const derived = await signatureDerivation(
        {
          chainId: ChainId.MAINNET.toFelt252(),
          accountAddress: wallet.address,
          poolAddress: POOL_HEX,
        },
        wallet.getAccountProvider().getSigner()
      );
      const expected = BigInt(ec.starkCurve.getStarkKey(derived));

      expect(mocknet.pool.get_public_key(env.alice.address)).toBe(expected);
    });

    it("deposits into the pool and discovers the resulting note", async () => {
      const { mocknet, env, create } = mockEnv();
      const transfers = await create();

      mocknet.executeOutside(await transfers.build().register().execute());

      mocknet.executeOutside(
        await transfers
          .build({ autoSetup: true, autoDiscover: { notes: "refresh" } })
          .with(env.ace, (t) => t.deposit({ amount: 100n }))
          .surplusTo(`0x${env.alice.address.toString(16)}`)
          .execute()
      );

      const { notes } = await transfers.discoverNotes();
      const owned = notes.get(BigInt(env.ace)) ?? [];
      const total = owned.reduce((sum, note) => sum + note.amount, 0n);

      expect(total).toBe(100n);
    });
  });

  /**
   * The wrapper's whole job is bracketing: quote the fee, resolve the proving
   * block, append the fee withdrawal, prove, submit. These drive it against the
   * SDK's mocknet so the composition is real rather than stubbed, with only the
   * paymaster's HTTP faked.
   */
  describe("withPaymaster", () => {
    const POOL_ADDRESS = 0x123n;
    const POOL_HEX = `0x${POOL_ADDRESS.toString(16)}`;
    const FORWARDER = fromAddress("0x75a1");

    const RELAY_SIGNATURE = ["0xr", "0xs"];

    /**
     * Typed data for the calls the request actually carried, as a real paymaster
     * builds it: the forwarder as caller, and the requested calls echoed back.
     */
    function relayTypedData(calls: unknown) {
      return {
        domain: {
          name: "Account.execute_from_outside",
          version: "2",
          chainId: "SN_MAIN",
        },
        primaryType: "OutsideExecution",
        types: {},
        message: {
          Caller: FORWARDER,
          Nonce: "0xserverchosen",
          "Execute After": "0x1",
          "Execute Before": `0x${(Math.floor(Date.now() / 1000) + 3600).toString(16)}`,
          Calls: (
            calls as { to: string; selector: string; calldata: string[] }[]
          ).map((call) => ({
            To: call.to,
            Selector: call.selector,
            Calldata: call.calldata,
          })),
        },
      };
    }

    /** Paymaster whose quote names `amount`, and whose execute always succeeds. */
    function paymasterStub(amount: string, token: string) {
      const submitted: Record<string, never>[] = [];
      const built: Record<string, never>[] = [];
      // Numbered from the second, so a test with one send still sees "0xsent"
      // while one with two can tell them apart.
      let submissions = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn((_url: string, init?: RequestInit) => {
          const body = JSON.parse(String(init?.body)) as {
            method: string;
            params: Record<string, never>;
          };
          if (body.method === "paymaster_buildTransaction") {
            built.push(body.params);
            // A real paymaster returns typed data only for the wrapped type, so
            // the stub does too: it is what makes the client's branch observable.
            const wrapped =
              (
                body.params as unknown as {
                  transaction: { type: string };
                }
              ).transaction.type === "invoke_and_apply_action";
            return Promise.resolve({
              status: 200,
              ok: true,
              json: () =>
                Promise.resolve({
                  result: {
                    fee_action: { recipient: FORWARDER, token, amount },
                    parameters: { version: "0x1", tip: "normal" },
                    ...(wrapped && {
                      typed_data: relayTypedData(
                        (
                          body.params as unknown as {
                            transaction: { invoke: { calls: unknown } };
                          }
                        ).transaction.invoke.calls
                      ),
                    }),
                  },
                }),
            } as Response);
          }
          submitted.push(body.params);
          submissions += 1;
          const transaction_hash =
            submissions === 1 ? "0xsent" : `0xsent${submissions}`;
          return Promise.resolve({
            status: 200,
            ok: true,
            json: () =>
              Promise.resolve({
                result: {
                  transaction_hash,
                  tracking_id: `track-${submissions}`,
                },
              }),
          } as Response);
        })
      );
      return { submitted, built };
    }

    function env(head = 500) {
      const mocknet = new Mocknet({ poolAddress: POOL_ADDRESS });
      const sdkEnv = mocknet.initialize();
      const wallet = walletWith(
        new StarkSigner(testPrivateKeys.key1),
        `0x${sdkEnv.alice.address.toString(16)}`
      );
      const provider = {
        getBlockNumber: vi.fn().mockResolvedValue(head),
        // Defaults to landing in the block that was the head at submit time.
        // Tests that care about the gap between the two override it.
        waitForTransaction: vi
          .fn()
          .mockResolvedValue({ block_number: head, isError: () => false }),
        // The pool's own published fee, which sponsored quotes are checked
        // against. High enough that the amounts these tests quote pass; the
        // tests for that check set it themselves.
        callContract: vi.fn().mockResolvedValue(["0xffffffff"]),
        // The SDK's simulate reads the chain from the provider it is handed.
        getChainId: vi
          .fn()
          .mockResolvedValue(shortString.encodeShortString("SN_MAIN")),
      } as unknown as RpcProvider;

      // Only `send({ invoke })` uses this; the private path never signs.
      const signTypedData = vi.fn().mockResolvedValue(RELAY_SIGNATURE);
      const RELAY_ACCOUNT = fromAddress("0xacc0");

      const bind = async (
        fee = { mode: "sponsored" } as const,
        { withAccount = false } = {}
      ) =>
        withPaymaster(
          await createPrivacy(wallet, {
            poolContractAddress: POOL_HEX,
            prover: new MockProofProvider(mocknet.pool),
            discovery: new ContractDiscoveryProvider(mocknet.pool),
            proofInvocationFactory: new MockProofInvocationFactory(),
          }),
          {
            poolContractAddress: POOL_HEX,
            url: "https://paymaster.example.com",
            fee,
            provider,
            chainId: ChainId.MAINNET,
            ...(withAccount && {
              account: { address: RELAY_ACCOUNT, signTypedData },
            }),
          }
        );

      return {
        mocknet,
        env: sdkEnv,
        provider,
        bind,
        signTypedData,
        relayAccount: RELAY_ACCOUNT,
      };
    }

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("submits a funded transaction through the paymaster", async () => {
      const { mocknet, env: sdkEnv, bind } = env();
      const { submitted } = paymasterStub(
        "0xa",
        `0x${BigInt(sdkEnv.ace).toString(16)}`
      );
      const privacy = await bind();
      mocknet.executeOutside(
        await privacy.transfers.build().register().execute()
      );

      const hash = await privacy.send(
        (b) =>
          b
            .with(sdkEnv.ace, (t) => t.deposit({ amount: 100n }))
            .surplusTo(`0x${sdkEnv.alice.address.toString(16)}`),
        { autoSetup: true, autoDiscover: { notes: "refresh" } }
      );

      expect(hash.transactionHash).toBe("0xsent");
      // The proof authorises this on-chain; no user signature is involved.
      expect(submitted[0]!).toMatchObject({
        transaction: { type: "apply_action" },
      });
    });

    it("really adds the fee withdrawal, not just the caller's actions", async () => {
      // The discriminating case: a fee larger than the deposit can only fail if
      // the withdrawal genuinely joined the action list. Drop the append and
      // this passes, which is the point.
      const { mocknet, env: sdkEnv, bind } = env();
      paymasterStub("0x3e8", `0x${BigInt(sdkEnv.ace).toString(16)}`);
      const privacy = await bind();
      mocknet.executeOutside(
        await privacy.transfers.build().register().execute()
      );

      await expect(
        privacy.send(
          (b) =>
            b
              .with(sdkEnv.ace, (t) => t.deposit({ amount: 100n }))
              .surplusTo(`0x${sdkEnv.alice.address.toString(16)}`),
          { autoSetup: true, autoDiscover: { notes: "refresh" } }
        )
      ).rejects.toThrow(/Insufficient balance/);
    });

    it("cannot pay a pool fee from an account with no private balance", async () => {
      // Why registration only ever happens bundled into a deposit: register
      // moves no funds, so there is nothing for the fee withdrawal to draw on,
      // and the paymaster charges for every transaction, register included.
      const { env: sdkEnv, bind } = env();
      paymasterStub("0x64", `0x${BigInt(sdkEnv.ace).toString(16)}`);
      const privacy = await bind();

      await expect(privacy.send((b) => b.register())).rejects.toThrow(
        /Insufficient balance/
      );
    });

    it("registers with no fee when the deployment charges nothing", async () => {
      // A zero amount must omit the withdrawal rather than add a zero-value
      // output, or this same empty-balance failure would apply to every send.
      const { env: sdkEnv, bind } = env();
      paymasterStub("0x0", `0x${BigInt(sdkEnv.ace).toString(16)}`);
      const privacy = await bind();

      await expect(privacy.send((b) => b.register())).resolves.toMatchObject({
        transactionHash: "0xsent",
      });
    });

    it("echoes the parameters the quote returned rather than rebuilding them", async () => {
      const { env: sdkEnv, bind } = env();
      const { submitted } = paymasterStub(
        "0x0",
        `0x${BigInt(sdkEnv.ace).toString(16)}`
      );
      const privacy = await bind();

      await privacy.send((b) => b.register());

      // `tip` was chosen by the server, never sent by us — rebuilding would
      // drop it, along with time bounds.
      expect(submitted[0]!.parameters).toEqual({
        version: "0x1",
        tip: "normal",
      });
    });

    it("quotes once per send, so the proof and the echo agree", async () => {
      // Two quotes could disagree: the fee is baked into the proof from the
      // first, while the paymaster is told to expect the second. It rejects that
      // as POOL_FEE_TOO_LOW *after* proving, the one step worth not repeating.
      const { env: sdkEnv, bind } = env();
      paymasterStub("0x0", `0x${BigInt(sdkEnv.ace).toString(16)}`);
      const privacy = await bind();

      await privacy.send((b) => b.register());

      const methods = vi.mocked(fetch).mock.calls.map(
        ([, init]) =>
          (
            JSON.parse(String((init as RequestInit).body)) as {
              method: string;
            }
          ).method
      );
      expect(
        methods.filter((m) => m === "paymaster_buildTransaction")
      ).toHaveLength(1);
      expect(methods).toContain("paymaster_executeTransaction");
    });

    it("quotes for a standalone submit, which has none of its own", async () => {
      // `submit()` is the escape hatch for a proof composed against
      // `.transfers`, so there is no earlier quote to echo.
      const { env: sdkEnv, bind } = env();
      paymasterStub("0x0", `0x${BigInt(sdkEnv.ace).toString(16)}`);
      const privacy = await bind();

      const { callAndProof } = await privacy.transfers
        .build()
        .register()
        .execute();
      await expect(privacy.submit(callAndProof)).resolves.toMatchObject({
        transactionHash: "0xsent",
      });

      // No caller-supplied parameters, so this path still has to fetch them.
      const methods = vi.mocked(fetch).mock.calls.map(
        ([, init]) =>
          (
            JSON.parse(String((init as RequestInit).body)) as {
              method: string;
            }
          ).method
      );
      expect(methods).toContain("paymaster_buildTransaction");
    });

    it("proves against head - depth on the first send", async () => {
      const { provider, env: sdkEnv, bind } = env(500);
      paymasterStub("0x0", `0x${BigInt(sdkEnv.ace).toString(16)}`);
      const privacy = await bind();

      await privacy.send((b) => b.register());

      expect(provider.getBlockNumber).toHaveBeenCalled();
    });

    it("waits for the previous send to age before proving the next", async () => {
      const { provider, env: sdkEnv, bind } = env(500);
      paymasterStub("0x0", `0x${BigInt(sdkEnv.ace).toString(16)}`);
      const privacy = await bind();
      const onWait = vi.fn();

      await privacy.send((b) => b.register());
      // First send recorded head 500; a proof for the next one may not read a
      // block before that, so the wait runs until the head passes 500 + depth.
      vi.mocked(provider.getBlockNumber)
        .mockResolvedValueOnce(505)
        .mockResolvedValue(515);

      await privacy.send((b) => b.register(), {
        wait: { onAttempt: onWait, pollIntervalMs: 1 },
      });

      expect(onWait).toHaveBeenCalled();
      const attempts = onWait.mock.calls.map(
        (call) => (call[0] as ProvableAttempt).ready
      );
      expect(attempts).toEqual([false, true]);
    });

    it("proves against a block that includes the previous send, not the head it was submitted at", async () => {
      // The head read at submit time precedes the block the transaction lands
      // in, so counting from it can pick a proving block *before* the previous
      // send — a proof that still believes those notes are unspent, which the
      // pool rejects. The SDK's own recipe counts from `receipt.block_number`.
      const { provider, env: sdkEnv, bind } = env(500);
      paymasterStub("0x0", `0x${BigInt(sdkEnv.ace).toString(16)}`);
      const privacy = await bind();

      await privacy.send((b) => b.register());

      // Submitted while the head was 500; the relayer landed it at 504.
      const LANDED_AT = 504;
      vi.mocked(provider.waitForTransaction).mockResolvedValue({
        block_number: LANDED_AT,
        isError: () => false,
      } as never);
      // At head 511, counting from 500 yields 501 — before the transaction
      // landed. Counting from 504 has to keep waiting, and lands on 505.
      vi.mocked(provider.getBlockNumber)
        .mockResolvedValueOnce(511)
        .mockResolvedValue(515);

      const build = vi.spyOn(privacy.transfers, "build");
      await privacy.send((b) => b.register(), { wait: { pollIntervalMs: 1 } });

      const { provingBlockId } = build.mock.calls[0]![0] as {
        provingBlockId: number;
      };
      expect(provingBlockId).toBeGreaterThan(LANDED_AT);
    });

    it("honours an explicit proving block without touching the chain head", async () => {
      const { provider, env: sdkEnv, bind } = env();
      paymasterStub("0x0", `0x${BigInt(sdkEnv.ace).toString(16)}`);
      const privacy = await bind();
      vi.mocked(provider.getBlockNumber).mockClear();

      await privacy.send((b) => b.register(), { provingBlockId: 42 });

      // Not read at all: the caller chose the block, and the next send seeds
      // its wait from this transaction's receipt rather than from the head.
      expect(provider.getBlockNumber).toHaveBeenCalledTimes(0);
    });

    it("clears the stale pool nonce when submission fails", async () => {
      const { env: sdkEnv, bind } = env();
      paymasterStub("0x0", `0x${BigInt(sdkEnv.ace).toString(16)}`);
      const privacy = await bind();
      const invalidate = vi.spyOn(
        privacy.transfers,
        "invalidateProofNonceCache"
      );
      vi.stubGlobal(
        "fetch",
        vi.fn((_url: string, init?: RequestInit) => {
          const body = JSON.parse(String(init?.body)) as { method: string };
          return Promise.resolve({
            status: 200,
            ok: true,
            json: () =>
              Promise.resolve(
                body.method === "paymaster_buildTransaction"
                  ? {
                      result: {
                        fee_action: {
                          recipient: FORWARDER,
                          token: "0x1",
                          amount: "0x0",
                        },
                      },
                    }
                  : {
                      error: {
                        code: 167,
                        message: "An error occurred (POOL_FEE_TOO_LOW)",
                      },
                    }
              ),
          } as Response);
        })
      );

      await expect(privacy.send((b) => b.register())).rejects.toThrow(
        "POOL_FEE_TOO_LOW"
      );
      // A failed invocation leaves a cached nonce that would poison the retry.
      expect(invalidate).toHaveBeenCalled();
    });

    it("awaits an async compose, so actions added after a suspension survive", async () => {
      // TypeScript accepts an async callback where a `void` return is declared, so
      // this compiles for any caller. Without the await the builder is still empty
      // when the proof is built, and the transaction silently does nothing the
      // caller asked for.
      const { mocknet, env: sdkEnv, bind } = env();
      const { submitted: submittedProbe } = paymasterStub(
        "0x0",
        `0x${BigInt(sdkEnv.ace).toString(16)}`
      );
      const privacy = await bind();
      mocknet.executeOutside(
        await privacy.transfers.build().register().execute()
      );

      const hash = await privacy.send(
        async (b) => {
          await Promise.resolve();
          b.with(sdkEnv.ace, (t) => t.deposit({ amount: 100n })).surplusTo(
            `0x${sdkEnv.alice.address.toString(16)}`
          );
        },
        { autoSetup: true, autoDiscover: { notes: "refresh" } }
      );

      expect(hash.transactionHash).toBe("0xsent");
      // The hash alone proves nothing: an empty builder still yields a
      // submittable proof. The action list is the evidence — without the await it
      // carries only the auto-setup channel and no Deposit at all.
      const actions = (
        submittedProbe[0]! as unknown as {
          transaction: {
            apply_action: { apply_actions_call: { calldata: string[] } };
          };
        }
      ).transaction.apply_action.apply_actions_call.calldata;
      expect(actions).toContain(shortString.encodeShortString("Deposit"));
    });

    /**
     * The SDK raises `USER_LINKAGE` when a transaction may connect the user's
     * private and public identities. Whether that is acceptable is the caller's
     * call, so it is reported and never acted on.
     *
     * The warning is injected rather than provoked: which compositions the SDK
     * considers linking is its heuristic to change, and pinning it here would
     * make these tests fail on an upstream tweak that costs us nothing.
     */
    describe("privacy warnings", () => {
      const LINKAGE = {
        code: "USER_LINKAGE",
        message: "the recipient is the depositor",
      };

      /** Real build and real proof, with warnings attached to the result. */
      function warnWith(
        privacy: Awaited<ReturnType<typeof withPaymaster>>,
        warnings: unknown[]
      ) {
        const build = privacy.transfers.build.bind(privacy.transfers);
        vi.spyOn(privacy.transfers, "build").mockImplementation((options?) => {
          const builder = build(options);
          const execute = builder.execute.bind(builder);
          builder.execute = async () => ({
            ...(await execute()),
            warnings: warnings as never,
          });
          return builder;
        });
      }

      async function ready() {
        const { mocknet, env: sdkEnv, bind } = env();
        const submitted = paymasterStub(
          "0x0",
          `0x${BigInt(sdkEnv.ace).toString(16)}`
        );
        const privacy = await bind();
        mocknet.executeOutside(
          await privacy.transfers.build().register().execute()
        );
        const compose = (b: PrivateTransfersBuilder) =>
          b
            .with(sdkEnv.ace, (t) => t.deposit({ amount: 100n }))
            .surplusTo(`0x${sdkEnv.alice.address.toString(16)}`);
        return { privacy, compose, submitted: submitted.submitted };
      }

      const options = {
        autoSetup: true,
        autoDiscover: { notes: "refresh" },
      } as const;

      it("reports warnings without refusing the transaction", async () => {
        const { privacy, compose } = await ready();
        warnWith(privacy, [LINKAGE]);
        const seen: unknown[] = [];

        const hash = await privacy.send(compose, {
          ...options,
          onWarnings: (warnings) => seen.push(...warnings),
        });

        expect(hash.transactionHash).toBe("0xsent");
        expect(seen).toEqual([LINKAGE]);
      });

      it("does not call back when there is nothing to report", async () => {
        const { privacy, compose } = await ready();
        warnWith(privacy, []);
        const onWarnings = vi.fn();

        await privacy.send(compose, { ...options, onWarnings });

        expect(onWarnings).not.toHaveBeenCalled();
      });

      it("lets the caller abort by throwing, before anything is submitted", async () => {
        const { privacy, compose, submitted } = await ready();
        warnWith(privacy, [LINKAGE]);

        await expect(
          privacy.send(compose, {
            ...options,
            onWarnings: () => {
              throw new Error("the user declined the linkage");
            },
          })
        ).rejects.toThrow("the user declined the linkage");

        // The caller's own error, and the proof never reached the paymaster.
        expect(submitted).toHaveLength(0);
      });
    });

    /**
     * Under `sponsored` the withdrawal is the pool fee and nothing else, and the
     * pool publishes that figure. It is the one part of a quote that can be
     * checked without trusting the endpoint, which caps what a substituted fee
     * recipient could collect.
     */
    describe("sponsored fee against the pool's own figure", () => {
      /** Quote a sponsored fee of `quoted` while the pool publishes `published`. */
      async function withFees(quoted: string, published: string) {
        const { env: sdkEnv, bind, provider } = env();
        paymasterStub(quoted, `0x${BigInt(sdkEnv.ace).toString(16)}`);
        vi.mocked(provider.callContract).mockResolvedValue([
          published,
        ] as never);
        return { privacy: await bind(), provider };
      }

      it("accepts a fee equal to the published one", async () => {
        const { privacy } = await withFees("0x64", "0x64");

        await expect(privacy.quote()).resolves.toMatchObject({
          feeAction: { amount: 0x64n },
        });
      });

      it("accepts a fee below the published one", async () => {
        // Charging less costs the relayer, not the caller, and the pool refuses
        // an underpaid fee itself.
        const { privacy } = await withFees("0x10", "0x64");

        await expect(privacy.quote()).resolves.toBeDefined();
      });

      it("refuses a fee above the published one", async () => {
        const { privacy } = await withFees("0x65", "0x64");

        await expect(privacy.quote()).rejects.toThrow(
          /above the 100 this pool publishes/
        );
      });

      it("reads the pool's fee from the pool the client is bound to", async () => {
        const { privacy, provider } = await withFees("0x64", "0x64");

        await privacy.quote();

        expect(provider.callContract).toHaveBeenCalledWith({
          contractAddress: fromAddress(POOL_HEX),
          entrypoint: "get_fee_amount",
          calldata: [],
        });
      });

      it("leaves the other fee modes alone, having nothing to compare", async () => {
        // `default` mixes in a gas ceiling; `sponsored_private` converts the fee.
        const { env: sdkEnv, bind, provider } = env();
        paymasterStub("0xffff", `0x${BigInt(sdkEnv.ace).toString(16)}`);
        vi.mocked(provider.callContract).mockResolvedValue(["0x1"] as never);

        const privacy = await bind({
          mode: "default",
          gasToken: fromAddress(`0x${BigInt(sdkEnv.ace).toString(16)}`),
        } as never);

        await expect(privacy.quote()).resolves.toBeDefined();
        expect(provider.callContract).not.toHaveBeenCalled();
      });

      it("reports a failed read and lets the quote through", async () => {
        // A second opinion that could not be taken is worth saying, not worth
        // failing a transaction the paymaster already priced.
        const { privacy, provider } = await withFees("0x64", "0x64");
        vi.mocked(provider.callContract).mockRejectedValue(
          new Error("rpc unavailable")
        );
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

        await expect(privacy.quote()).resolves.toBeDefined();
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining("Could not read the pool's own fee")
        );
        warn.mockRestore();
      });
    });

    it("spends existing notes without being asked to select them", async () => {
      // `send` appends a fee withdrawal in the paymaster's token, which the
      // caller never names, so it defaults a note-selection strategy. Without one
      // the builder picks no inputs and the transaction fails for insufficient
      // balance while the notes sit there unspent.
      const { mocknet, env: sdkEnv, bind } = env();
      paymasterStub("0x0", `0x${BigInt(sdkEnv.ace).toString(16)}`);
      const privacy = await bind();
      const me = `0x${sdkEnv.alice.address.toString(16)}`;

      // Funded through the builder rather than `send`, so no earlier submission
      // has to age before the next proof.
      mocknet.executeOutside(
        await privacy.transfers
          .build({ autoSetup: true })
          .register()
          .with(sdkEnv.ace, (t) => t.deposit({ amount: 1000n }))
          .surplusTo(me)
          .execute()
      );

      // Deliberately no `autoSelectNotes` here: that is the point.
      const hash = await privacy.send(
        (b) =>
          b
            .with(sdkEnv.ace, (t) => t.withdraw({ recipient: me, amount: 10n }))
            .surplusTo(me),
        {
          autoSetup: true,
          autoDiscover: { notes: "refresh", channels: "refresh" },
        }
      );

      expect(hash.transactionHash).toBe("0xsent");
    });

    it("runs overlapping sends one at a time", async () => {
      // Two sends started together would otherwise both read the same earlier
      // submission and prove against the same state, and the second would spend
      // notes the first already consumed.
      const { mocknet, env: sdkEnv, bind, provider } = env();
      paymasterStub("0x0", `0x${BigInt(sdkEnv.ace).toString(16)}`);
      const privacy = await bind();
      const me = `0x${sdkEnv.alice.address.toString(16)}`;
      mocknet.executeOutside(
        await privacy.transfers.build().register().execute()
      );

      // Each send resolves its proving block through the provider, so the head
      // reads mark where one send ends and the next begins.
      const order: string[] = [];
      let head = 500;
      vi.mocked(provider.getBlockNumber).mockImplementation(() => {
        order.push("resolve");
        // The chain moves on between sends, so the second one's wait for the
        // first to age can actually finish.
        const current = head;
        head += 20;
        return Promise.resolve(current);
      });
      const deposit = (b: PrivateTransfersBuilder) =>
        b.with(sdkEnv.ace, (t) => t.deposit({ amount: 100n })).surplusTo(me);
      const options = {
        autoSetup: true,
        autoDiscover: { notes: "refresh" },
        wait: { pollIntervalMs: 1 },
      } as const;

      const first = privacy.send(deposit, options);
      const second = privacy.send(deposit, options);
      const hashes = await Promise.all([first, second]);

      // Distinct hashes, in the order the sends were started.
      expect(hashes.map((h) => h.transactionHash)).toEqual([
        "0xsent",
        "0xsent2",
      ]);

      // The assertion that proves ordering rather than mere success: the second
      // send aged against the *first send's* transaction, which it could only
      // know about once that send had finished writing it.
      expect(vi.mocked(provider.waitForTransaction)).toHaveBeenCalledWith(
        "0xsent",
        expect.anything()
      );
      // Concurrent sends would each resolve a block from the same starting point.
      expect(order).toHaveLength(2);
    });

    it("returns the relayer's tracking id alongside the hash", async () => {
      // Nothing can look a tracking id up later, so the value has to come back
      // from the submission that produced it or it is gone.
      const { mocknet, env: sdkEnv, bind } = env();
      paymasterStub("0x0", `0x${BigInt(sdkEnv.ace).toString(16)}`);
      const privacy = await bind();
      mocknet.executeOutside(
        await privacy.transfers.build().register().execute()
      );

      await expect(
        privacy.send(
          (b) =>
            b
              .with(sdkEnv.ace, (t) => t.deposit({ amount: 100n }))
              .surplusTo(`0x${sdkEnv.alice.address.toString(16)}`),
          { autoSetup: true, autoDiscover: { notes: "refresh" } }
        )
      ).resolves.toMatchObject({
        transactionHash: "0xsent",
        trackingId: "track-1",
      });
    });

    it("compiles against a copy of a registry the caller keeps", async () => {
      // Compiling resolves the state the transaction will produce, and it runs
      // before the proof exists. Writing the caller's registry there would record
      // a transaction that proving or submission may yet refuse.
      const { mocknet, env: sdkEnv, bind } = env();
      paymasterStub("0x0", `0x${BigInt(sdkEnv.ace).toString(16)}`);
      const privacy = await bind();
      mocknet.executeOutside(
        await privacy.transfers.build().register().execute()
      );
      const registry = createEmptyRegistry();

      const result = await privacy.send(
        (b) =>
          b
            .with(sdkEnv.ace, (t) => t.deposit({ amount: 100n }))
            .surplusTo(`0x${sdkEnv.alice.address.toString(16)}`),
        { autoSetup: true, autoDiscover: { notes: "refresh" }, registry }
      );

      expect(registry.notes.size).toBe(0);
      expect(registry.channels.size).toBe(0);
      // Handed back instead, for the caller to adopt once they are satisfied.
      expect(result.registry).not.toBe(registry);
      expect(result.registry.notes.size).toBeGreaterThan(0);
    });

    /**
     * The point of this one is that it previews what `send` would do, fee
     * withdrawal included, rather than reporting on a raw action list.
     *
     * The SDK's own simulation is stubbed: it calls a pool view function for gas
     * estimation, and reproducing that here would test the SDK rather than this
     * wrapper. What is asserted is the wrapper's part.
     */
    describe("simulate", () => {
      async function ready(fee = "0x64") {
        const { mocknet, env: sdkEnv, bind, provider } = env();
        const stub = paymasterStub(fee, `0x${BigInt(sdkEnv.ace).toString(16)}`);
        const privacy = await bind();
        mocknet.executeOutside(
          await privacy.transfers.build().register().execute()
        );

        const warnings = [{ code: "USER_LINKAGE", message: "linked" }];
        const withdrawnTo: unknown[] = [];
        let buildOptions: unknown;

        const build = privacy.transfers.build.bind(privacy.transfers);
        vi.spyOn(privacy.transfers, "build").mockImplementation((options?) => {
          buildOptions = options;
          const builder = build(options);
          // `with` is overloaded, so the wrapper is typed loosely and cast back.
          const withFn = builder.with.bind(builder) as (
            token: unknown,
            ops?: unknown
          ) => unknown;
          builder.with = ((token: unknown, ops?: unknown) => {
            withdrawnTo.push(token);
            return withFn(token, ops);
          }) as typeof builder.with;
          builder.simulate = async () =>
            ({ warnings }) as unknown as ReturnType<typeof builder.simulate>;
          return builder;
        });

        return {
          privacy,
          provider,
          warnings,
          withdrawnTo,
          submitted: stub.submitted,
          feeToken: `0x${BigInt(sdkEnv.ace).toString(16)}`,
          options: () => buildOptions,
          compose: (b: PrivateTransfersBuilder) =>
            b
              .with(sdkEnv.ace, (t) => t.deposit({ amount: 100n }))
              .surplusTo(`0x${sdkEnv.alice.address.toString(16)}`),
        };
      }

      it("reports the fee the real send would withdraw, and the warnings", async () => {
        const { privacy, compose, warnings } = await ready("0x64");

        const simulation = await privacy.simulate(compose, { autoSetup: true });

        expect(simulation.feeAction.amount).toBe(0x64n);
        expect(simulation.warnings).toEqual(warnings);
      });

      it("appends the same fee withdrawal `send` would", async () => {
        // The inherited `simulate` could not: it takes a raw action list and knows
        // nothing about the paymaster's fee.
        const { privacy, compose, withdrawnTo, feeToken } = await ready("0x64");

        await privacy.simulate(compose, { autoSetup: true });

        expect(withdrawnTo.map(String)).toContain(fromAddress(feeToken));
      });

      it("submits nothing", async () => {
        const { privacy, compose, submitted } = await ready();

        await privacy.simulate(compose, { autoSetup: true });

        expect(submitted).toHaveLength(0);
      });

      it("does not hand back a proof that cannot be submitted", async () => {
        // The mock proof has the shape and none of the substance, so returning it
        // would invite exactly the mistake `assertProofSendable` now refuses.
        const { privacy, compose } = await ready();

        const simulation = await privacy.simulate(compose, { autoSetup: true });

        expect(simulation).not.toHaveProperty("callAndProof");
      });

      it("waits for no block", async () => {
        // A preview that costs a ten-block wait is not a preview.
        const { privacy, compose, provider } = await ready();

        await privacy.simulate(compose, { autoSetup: true });

        expect(vi.mocked(provider.getBlockNumber)).not.toHaveBeenCalled();
      });

      it("writes no private state", async () => {
        // `registryConst` is what makes a simulation safe beside a live send: any
        // registry the caller passed is read, copied, and left as it was.
        const { privacy, compose, options } = await ready();

        await privacy.simulate(compose, { autoSetup: true });

        expect(options()).toMatchObject({ registryConst: true });
      });
    });

    it("delegates reads to the SDK client untouched", async () => {
      const { bind } = env();
      paymasterStub("0x0", "0x1");
      const privacy = await bind();
      const spy = vi.spyOn(privacy.transfers, "discoverNotes");

      await privacy.discoverNotes();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(privacy.user).toBe(privacy.transfers.user);
    });

    it("does not expose the proof paths that would skip the fee", async () => {
      const { bind } = env();
      paymasterStub("0x0", "0x1");
      const privacy = await bind();

      // `build`/`execute`/`createProofInvocation` stay on `.transfers`, so a
      // caller cannot accidentally produce a proof the paymaster will reject.
      expect("build" in privacy).toBe(false);
      expect("execute" in privacy).toBe(false);
      expect("createProofInvocation" in privacy).toBe(false);
      expect(typeof privacy.transfers.build).toBe("function");
    });

    describe("relaying public calls with send({ invoke })", () => {
      /** Composes a deposit, which is the flow that wants a public `approve`. */
      const deposit =
        (sdkEnv: { ace: string; alice: { address: bigint } }) =>
        (b: PrivateTransfersBuilder) =>
          b
            .with(sdkEnv.ace, (t) => t.deposit({ amount: 100n }))
            .surplusTo(`0x${sdkEnv.alice.address.toString(16)}`);

      const options = {
        autoSetup: true,
        autoDiscover: { notes: "refresh" },
      } as const;

      it("quotes the wrapped type and submits the signature over the quote's own typed data", async () => {
        const {
          mocknet,
          env: sdkEnv,
          bind,
          signTypedData,
          relayAccount,
        } = env();
        const { submitted, built } = paymasterStub(
          "0xa",
          `0x${BigInt(sdkEnv.ace).toString(16)}`
        );
        const privacy = await bind(
          { mode: "sponsored" },
          { withAccount: true }
        );
        mocknet.executeOutside(
          await privacy.transfers.build().register().execute()
        );

        const approve = {
          contractAddress: `0x${BigInt(sdkEnv.ace).toString(16)}`,
          entrypoint: "approve",
          calldata: ["0x1", "0x2"],
        };
        const hash = await privacy.send(deposit(sdkEnv), {
          ...options,
          invoke: [approve],
        });

        expect(hash.transactionHash).toBe("0xsent");
        // Build asked for the wrapped type, naming the binding's account.
        expect(built[0]!).toMatchObject({
          transaction: {
            type: "invoke_and_apply_action",
            invoke: { user_address: relayAccount },
          },
        });
        // The signature covers the bytes the paymaster chose, echoed unchanged --
        // it picks the nonce, so a rebuilt copy would not verify. Asserting the
        // round trip rather than a fixture: what was signed is what was submitted.
        expect(signTypedData).toHaveBeenCalledTimes(1);
        const signedOver = signTypedData.mock.calls[0]![0];
        expect(signedOver).toMatchObject({
          primaryType: "OutsideExecution",
          message: {
            Caller: FORWARDER,
            Calls: [
              {
                To: approve.contractAddress,
                Selector: starknetHash.getSelectorFromName("approve"),
                Calldata: approve.calldata,
              },
            ],
          },
        });
        expect(submitted[0]!).toMatchObject({
          transaction: {
            type: "invoke_and_apply_action",
            invoke: {
              user_address: relayAccount,
              typed_data: signedOver,
              signature: RELAY_SIGNATURE,
            },
          },
        });
      });

      it("asks for the signature before proving, not after", async () => {
        // Ordering is the whole point: the signature does not depend on the proof,
        // so a user who declines must not have paid for proving first. Reverse the
        // two in `send` and this fails.
        const { mocknet, env: sdkEnv, bind, signTypedData, provider } = env();
        paymasterStub("0xa", `0x${BigInt(sdkEnv.ace).toString(16)}`);
        const privacy = await bind(
          { mode: "sponsored" },
          { withAccount: true }
        );
        mocknet.executeOutside(
          await privacy.transfers.build().register().execute()
        );

        const order: string[] = [];
        signTypedData.mockImplementation(() => {
          order.push("sign");
          return Promise.resolve(RELAY_SIGNATURE);
        });
        vi.mocked(provider.getBlockNumber).mockImplementation(() => {
          order.push("resolve-proving-block");
          return Promise.resolve(500);
        });

        await privacy.send(deposit(sdkEnv), {
          ...options,
          invoke: [
            {
              contractAddress: `0x${BigInt(sdkEnv.ace).toString(16)}`,
              entrypoint: "approve",
            },
          ],
        });

        expect(order[0]).toBe("sign");
        expect(order).toContain("resolve-proving-block");
      });

      it("refuses before touching the network when nothing can sign", async () => {
        const { env: sdkEnv, bind } = env();
        paymasterStub("0xa", `0x${BigInt(sdkEnv.ace).toString(16)}`);
        // Bound without an account, as `withPaymaster` allows.
        const privacy = await bind();

        await expect(
          privacy.send(deposit(sdkEnv), {
            ...options,
            invoke: [
              {
                contractAddress: `0x${BigInt(sdkEnv.ace).toString(16)}`,
                entrypoint: "approve",
              },
            ],
          })
        ).rejects.toThrow(/needs that account and a way to sign/);
        // Rejected on the request itself: no quote was even attempted.
        expect(vi.mocked(fetch)).not.toHaveBeenCalled();
      });

      it("leaves the unwrapped path alone", async () => {
        const { mocknet, env: sdkEnv, bind, signTypedData } = env();
        const { submitted, built } = paymasterStub(
          "0xa",
          `0x${BigInt(sdkEnv.ace).toString(16)}`
        );
        // An account is available, but no calls are passed.
        const privacy = await bind(
          { mode: "sponsored" },
          { withAccount: true }
        );
        mocknet.executeOutside(
          await privacy.transfers.build().register().execute()
        );

        await privacy.send(deposit(sdkEnv), options);

        // Merely having a signer must not drag a signature into the private path.
        expect(built[0]!).toMatchObject({
          transaction: { type: "apply_action" },
        });
        expect(submitted[0]!).toMatchObject({
          transaction: { type: "apply_action" },
        });
        expect(signTypedData).not.toHaveBeenCalled();
      });

      it("ignores an empty call list rather than wrapping nothing", async () => {
        const { mocknet, env: sdkEnv, bind, signTypedData } = env();
        const { built } = paymasterStub(
          "0xa",
          `0x${BigInt(sdkEnv.ace).toString(16)}`
        );
        const privacy = await bind(
          { mode: "sponsored" },
          { withAccount: true }
        );
        mocknet.executeOutside(
          await privacy.transfers.build().register().execute()
        );

        await privacy.send(deposit(sdkEnv), { ...options, invoke: [] });

        expect(built[0]!).toMatchObject({
          transaction: { type: "apply_action" },
        });
        expect(signTypedData).not.toHaveBeenCalled();
      });
    });
  });

  describe("optional peer dependency", () => {
    // `vi.mock` is file-scoped and hoisted, which would break the mock-driven
    // group above. `doMock` + `resetModules` scopes the missing dependency to
    // these tests instead — and the reset is what makes them meaningful at all,
    // since `loadPrivacySdk` memoises the module namespace for the lifetime of
    // its module instance.
    afterEach(() => {
      vi.doUnmock("@starkware-libs/starknet-privacy-sdk");
      vi.resetModules();
    });

    /** Load `@/privacy` from a fresh registry with the SDK absent. */
    async function privacyWithoutSdk() {
      vi.resetModules();
      vi.doMock("@starkware-libs/starknet-privacy-sdk", () => {
        throw new Error(
          "Cannot find package '@starkware-libs/starknet-privacy-sdk'"
        );
      });

      // Everything must come from the same reset registry, or the `instanceof
      // StarkSigner` gate would compare against a different class object and
      // fail before reaching the dependency check.
      const [privacy, signer, accounts] = await Promise.all([
        import("@/privacy"),
        import("@/signer"),
        import("@/wallet/accounts/provider"),
      ]);

      const wallet = {
        address: fromAddress("0xabc"),
        getChainId: () => ChainId.MAINNET,
        getAccountProvider: () =>
          new accounts.AccountProvider(
            new signer.StarkSigner(testPrivateKeys.key1)
          ),
      } as unknown as Wallet;

      return { privacy, wallet };
    }

    it("surfaces an install hint naming the registry and Node requirement", async () => {
      const { privacy, wallet } = await privacyWithoutSdk();

      const error = await privacy
        .createPrivacy(wallet, {
          poolContractAddress: "0x1",
          prover: "https://prover.example.com",
          discovery: "https://discovery.example.com",
        })
        .then(
          () => new Error("expected createPrivacy to reject"),
          (e: unknown) => e as Error
        );

      expect(error.message).toContain(
        'requires optional peer dependency "@starkware-libs/starknet-privacy-sdk"'
      );
      expect(error.message).toContain("read:packages");
      expect(error.message).toContain("Node >= 24");
    });

    it("keeps the SDK-free helpers usable", async () => {
      // Sequencing and error classification deliberately avoid the optional
      // dependency, so they still work when it is absent.
      const { privacy } = await privacyWithoutSdk();
      const provider = {
        getBlockNumber: vi.fn().mockResolvedValue(120),
      } as unknown as RpcProvider;

      await expect(privacy.waitForProvableBlock(provider, 100)).resolves.toBe(
        110
      );
      expect(
        privacy.screeningVerdict({ code: 10000, data: "address_blocked" })
      ).toBe("rejected");
    });
  });
});
