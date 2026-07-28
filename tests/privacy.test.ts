import { afterEach, describe, expect, it, vi } from "vitest";
import { ec, type RpcProvider, type Signature } from "starknet";
import {
  Mocknet,
  MockProofInvocationFactory,
  MockProofProvider,
  ContractDiscoveryProvider,
} from "@starkware-libs/starknet-privacy-sdk/testing";
import {
  PROOF_BASE_BLOCK_DEPTH,
  waitForProvableBlock,
} from "@/privacy/sequencing";
import { screeningVerdict } from "@/privacy/errors";
import { createPrivacy } from "@/privacy/create";
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
      ).rejects.toThrow("require a signer that declares");
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
        "require a signer that declares"
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
      const derived = await wallet.getAccountProvider().getViewingKey({
        chainId: ChainId.MAINNET.toFelt252(),
        poolAddress: POOL_HEX,
      });
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
