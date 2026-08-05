import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RpcError,
  ec,
  hash as starknetHash,
  type RpcProvider,
  type Signature,
} from "starknet";
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
import { createPrivacy } from "@/privacy/create";
import { signatureDerivation } from "@/privacy/viewing-key";
import { withPaymaster } from "@/privacy/client";
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
  });

  /**
   * The state-based waits exist because counting blocks from a receipt only
   * works for transactions this process saw. An account funded from a faucet,
   * a bridge or another wallet has no receipt here, so the precondition has to
   * be read off-chain state instead.
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

      expect(hash).toBe("0xabc");
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

    /** Paymaster whose quote names `amount`, and whose execute always succeeds. */
    function paymasterStub(amount: string, token: string) {
      const submitted: Record<string, never>[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn((_url: string, init?: RequestInit) => {
          const body = JSON.parse(String(init?.body)) as {
            method: string;
            params: Record<string, never>;
          };
          if (body.method === "paymaster_buildTransaction") {
            return Promise.resolve({
              status: 200,
              ok: true,
              json: () =>
                Promise.resolve({
                  result: {
                    fee_action: { recipient: FORWARDER, token, amount },
                    parameters: { version: "0x1", tip: "normal" },
                  },
                }),
            } as Response);
          }
          submitted.push(body.params);
          return Promise.resolve({
            status: 200,
            ok: true,
            json: () =>
              Promise.resolve({ result: { transaction_hash: "0xsent" } }),
          } as Response);
        })
      );
      return submitted;
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
      } as unknown as RpcProvider;

      const bind = async (fee = { mode: "sponsored" } as const) =>
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
          }
        );

      return { mocknet, env: sdkEnv, provider, bind };
    }

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("submits a funded transaction through the paymaster", async () => {
      const { mocknet, env: sdkEnv, bind } = env();
      const submitted = paymasterStub(
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

      expect(hash).toBe("0xsent");
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

      await expect(privacy.send((b) => b.register())).resolves.toBe("0xsent");
    });

    it("echoes the parameters the quote returned rather than rebuilding them", async () => {
      const { env: sdkEnv, bind } = env();
      const submitted = paymasterStub(
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
      await expect(privacy.submit(callAndProof)).resolves.toBe("0xsent");

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

      await privacy.send((b) => b.register(), { onWait });

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
      await privacy.send((b) => b.register());

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
