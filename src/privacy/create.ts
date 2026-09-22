import type { constants } from "starknet";
import type {
  DiscoveryProviderInterface,
  OhttpOption,
  ProofProviderConfig,
  ProofProviderInterface,
  PrivateTransfersInterface,
} from "@starkware-libs/starknet-privacy-sdk";

import { SignerAdapter } from "@/signer";
import type { PrivacyPaymasterConfig } from "@/privacy/paymaster";
import type { Wallet } from "@/wallet";
import { assertSafeHttpUrl } from "@/utils";
import { loadPrivacySdk, type PrivacySdkModule } from "@/privacy/runtime";
import {
  accountLeafDerivation,
  assertCanonicalViewingKey,
  assertViewingKeySigner,
  type ViewingKeyContext,
  type ViewingKeyDerivation,
} from "@/privacy/viewing-key";

/** Parameters accepted by the SDK's own factory. */
type CreatePrivateTransfersParams = Parameters<
  PrivacySdkModule["createPrivateTransfers"]
>[0];

/**
 * Options of the SDK's own indexer discovery provider.
 */
type IndexerOptions = NonNullable<
  ConstructorParameters<PrivacySdkModule["IndexerDiscoveryProvider"]>[2]
>;

/**
 * Validate a service URL and strip trailing slashes.
 *
 * The privacy SDK builds sub-paths by concatenation, so a trailing slash
 * causes a 404 deep inside the SDK. A path prefix is kept.
 */
function asBaseUrl(
  value: string,
  label: string,
  allowInsecureHttp: boolean | undefined
): string {
  assertSafeHttpUrl(value, label, { allowInsecureHttp });
  return value.trim().replace(/\/+$/, "");
}

/**
 * Warn when a service URL is plain `http://`.
 *
 * The prover and the discovery service receive the viewing key. Over
 * cleartext, anyone on the path can read it. OHTTP does not help here, because
 * its key config is fetched over the same channel.
 *
 * A warning, not an error. Plain HTTP on loopback or a trusted network is the
 * integrator's call. Uses `console.warn`, because the SDK logger is silent by
 * default.
 *
 * A `prover` or `discovery` given as an instance has no URL, so it is not
 * checked.
 */
function warnIfPlaintext(url: string, label: string): void {
  if (new URL(url).protocol !== "http:") return;

  console.warn(
    `[starkzap] ${label} is plain http://, so the viewing key it receives is ` +
      "readable in transit. Use https:// unless this is localhost or an " +
      "otherwise trusted network."
  );
}

/**
 * Validate the OHTTP relay URL, which nothing else checks.
 * Every other field of `OhttpOption` passes through untouched.
 */
function normalizeOhttp(
  option: OhttpOption | undefined,
  allowInsecureHttp: boolean | undefined
): OhttpOption | undefined {
  if (option === undefined || typeof option === "boolean") return option;
  if (option.relayUrl === undefined) return option;

  return {
    ...option,
    relayUrl: asBaseUrl(
      option.relayUrl,
      "Privacy OHTTP relay URL",
      allowInsecureHttp
    ),
  };
}

/** Configuration for {@link createPrivacy}. */
export interface PrivacyConfig {
  /**
   * Privacy pool contract address.
   *
   * Bound into the viewing key.
   */
  poolContractAddress: string;
  /**
   * Proving service: a base URL, or a {@link ProofProviderInterface} instance.
   *
   * Pass an instance to use your own prover, or the SDK's `MockProofProvider`
   * in tests.
   */
  prover: string | ProofProviderInterface;
  /**
   * Discovery service: a base URL, or a {@link DiscoveryProviderInterface}
   * instance (e.g. the SDK's `ContractDiscoveryProvider`).
   */
  discovery: string | DiscoveryProviderInterface;
  /**
   * Enable OHTTP envelope encryption for the discovery and proving services.
   *
   * Without it, the service operator can read the viewing key. Pass `true`
   * for defaults, or an object to pin a key config or use a relay.
   *
   * Ignored for a `prover` or `discovery` given as an instance.
   *
   * Both services must support OHTTP. Otherwise every call throws.
   */
  ohttp?: OhttpOption;
  /**
   * Accept plain `http://` on non-loopback hosts for `prover`, `discovery`, the
   * OHTTP `relayUrl` and `paymaster.url`.
   *
   * Over plain http, anyone on the network can read the viewing key. Loopback
   * is always accepted. Set this only for a trusted network, such as a LAN
   * reached from a device or emulator. A warning is still printed.
   *
   * @default false
   */
  allowInsecureHttp?: boolean;
  /**
   * Shadow account anonymizer contract address. Only needed for
   * `shadowAccounts(...)`.
   */
  shadowAccountAnonymizerAddress?: string;
  /**
   * Override how proof invocations are built.
   *
   * Only needed with a mock prover. The SDK's `MockProofProvider` expects
   * invocations from its `MockProofInvocationFactory`.
   */
  proofInvocationFactory?: CreatePrivateTransfersParams["proofInvocationFactory"];
  /**
   * Submission through a paymaster's relayer. This keeps the account
   * off-chain, except for calls you relay with `invoke`. See
   * {@link PrivacyPaymasterConfig}.
   *
   * {@link createPrivacy} itself ignores it. `connectPrivacy` and
   * `withPaymaster` require it.
   *
   * Omit it to submit through your own infrastructure. The SDK's own route,
   * `wallet.execute(calls, { proof, unsafeUserPays: true })`, puts the sender
   * on-chain and removes the privacy.
   */
  paymaster?: PrivacyPaymasterConfig;
  /**
   * How the viewing key is derived for this account.
   *
   * Defaults to {@link accountLeafDerivation}, SNIP-44 `account-leaf-v1` run
   * inside the signer. It requires a signer with
   * {@link SignerInterface.deriveViewingKey}. Set this for another scheme, or
   * for a signer that only signs.
   *
   * The pool stores the first key an account registers. It cannot be replaced.
   * Changing this for a registered account orphans its notes.
   */
  viewingKeyDerivation?: ViewingKeyDerivation;
}

/**
 * Revocation handles for the clients this module built.
 *
 * A `WeakMap`, not a method, because the return type must stay the privacy
 * SDK's own interface.
 */
const revocations = new WeakMap<PrivateTransfersInterface, () => void>();

/**
 * Stop a privacy client from using its viewing key again.
 *
 * The SDK asks for the key on every operation, so after this every call that
 * needs to decrypt throws. {@link Wallet.disconnect} calls this for the client
 * it handed out.
 *
 * This does not scrub memory, and it does not undo what was already
 * decrypted. Notes and channels already discovered stay readable in the
 * caller's registry.
 *
 * Safe to call more than once.
 *
 * @param transfers - A client from {@link createPrivacy}, or the `transfers` of
 *   one from `connectPrivacy`
 */
export function revokePrivacy(transfers: PrivateTransfersInterface): void {
  revocations.get(transfers)?.();
}

/**
 * Create a privacy pool client bound to a starkzap wallet.
 *
 * Returns the privacy SDK's own {@link PrivateTransfersInterface}, not a
 * wrapper. Use the builder, discovery and history APIs as the SDK documents
 * them. This function derives the viewing key, bridges the signer, resolves
 * the chain and refuses wallets that cannot support the flow.
 *
 * Submit the result with {@link Wallet.execute}, which carries the proof as
 * transaction-level fields:
 *
 * ```ts
 * const { callAndProof } = await transfers.build(...).execute();
 * const tx = await wallet.execute([callAndProof.call], {
 *   proof: callAndProof.proof,
 * });
 * ```
 *
 * A privacy call cannot be batched with other calls. The proof belongs to the
 * transaction, so it cannot go through {@link TxBuilder}.
 *
 * Two things are the caller's responsibility:
 *
 * - **A deposit needs an ERC20 approve to the pool first.** Send it as its own
 *   transaction with `wallet.tx().approve(token, pool, amount).send()`, or
 *   pass it as `invoke` to `PrivacyClient.send`. It does not have to age.
 * - **On-chain state a proof reads must be about 10 blocks old.** This covers
 *   a top-up before a deposit, the account's deployment before `register()`,
 *   and the previous privacy transaction. Use {@link waitForFundedBalance} or
 *   {@link waitForProvableBlock} and pass the result as `provingBlockId`.
 *
 * @param wallet - A locally-signed wallet. `CartridgeWallet` is not accepted.
 *   It has no {@link AccountProvider}, so it cannot produce the viewing key.
 * @param config - Pool address and service endpoints
 * @returns The privacy SDK client
 * @throws If the optional peer dependency is not installed. Viewing key
 *   derivation throws separately, on first use. See
 *   {@link ViewingKeyDerivation}
 *
 * @example
 * ```ts
 * const transfers = await createPrivacy(wallet, {
 *   poolContractAddress: POOL,
 *   prover: "https://prover.example.com",
 *   discovery: "https://discovery.example.com",
 *   ohttp: true,
 * });
 *
 * const { callAndProof } = await transfers.build().register().execute();
 * await wallet.execute([callAndProof.call], { proof: callAndProof.proof });
 * ```
 */
export async function createPrivacy(
  wallet: Wallet,
  config: PrivacyConfig
): Promise<PrivateTransfersInterface> {
  const signer = wallet.getAccountProvider().getSigner();

  // Check the default derivation's precondition now, not on first use. A
  // custom derivation owns its own checks.
  if (config.viewingKeyDerivation === undefined) {
    assertViewingKeySigner(signer);
  }

  // Validate URLs before loading the SDK, so a bad URL fails fast.
  const prover =
    typeof config.prover === "string"
      ? asBaseUrl(
          config.prover,
          "Privacy proving service URL",
          config.allowInsecureHttp
        )
      : config.prover;
  const discovery =
    typeof config.discovery === "string"
      ? asBaseUrl(
          config.discovery,
          "Privacy discovery service URL",
          config.allowInsecureHttp
        )
      : config.discovery;
  const ohttp = normalizeOhttp(config.ohttp, config.allowInsecureHttp);

  if (typeof prover === "string") {
    warnIfPlaintext(prover, "Privacy proving service URL");
  }
  if (typeof discovery === "string") {
    warnIfPlaintext(discovery, "Privacy discovery service URL");
  }

  const sdk = await loadPrivacySdk();

  const chainId = wallet.getChainId().toFelt252() as constants.StarknetChainId;

  const derive = config.viewingKeyDerivation ?? accountLeafDerivation;
  const context: ViewingKeyContext = {
    chainId,
    accountAddress: wallet.address,
    poolAddress: config.poolContractAddress,
  };

  // Derived once per client and held in the closure, never persisted. The
  // discovery service rejects a key that does not match the registered one.
  let viewingKey: Promise<string> | undefined;
  let revoked = false;
  const revokedError = () =>
    new Error(
      "[starkzap] This privacy client was revoked, so its viewing key is no " +
        "longer available. Build a new one with `connectPrivacy()` or " +
        "`createPrivacy()` after reconnecting."
    );

  const getViewingKey = async (): Promise<string> => {
    if (revoked) throw revokedError();

    // Cache the promise, so concurrent callers share one derivation. A failure
    // clears the cache so the next call can retry.
    viewingKey ??= derive(context, signer).then(
      (derived) => {
        assertCanonicalViewingKey(derived);
        return derived;
      },
      (error: unknown) => {
        viewingKey = undefined;
        throw error;
      }
    );

    const key = await viewingKey;
    // Check again. Revocation can happen while the derivation is waiting.
    if (revoked) throw revokedError();
    return key;
  };

  let provingProvider: CreatePrivateTransfersParams["provingProvider"];
  if (typeof prover === "string") {
    const proving: ProofProviderConfig = { url: prover, chainId };
    if (ohttp !== undefined) {
      proving.ohttp = ohttp;
    }
    provingProvider = proving;
  } else {
    provingProvider = prover;
  }

  let discoveryProvider: CreatePrivateTransfersParams["discoveryProvider"];
  if (typeof discovery === "string") {
    const indexer: IndexerOptions = {};
    if (ohttp !== undefined) {
      indexer.ohttp = ohttp;
    }
    discoveryProvider = new sdk.IndexerDiscoveryProvider(
      discovery,
      config.poolContractAddress,
      indexer
    );
  } else {
    discoveryProvider = discovery;
  }

  const params: CreatePrivateTransfersParams = {
    account: {
      address: wallet.address,
      // The SDK needs the full starknet.js signer surface.
      signer: new SignerAdapter(signer),
    },
    viewingKeyProvider: { getViewingKey },
    provingProvider,
    discoveryProvider,
    poolContractAddress: config.poolContractAddress,
  };

  if (config.proofInvocationFactory !== undefined) {
    params.proofInvocationFactory = config.proofInvocationFactory;
  }
  if (config.shadowAccountAnonymizerAddress !== undefined) {
    params.shadowAccountAnonymizerAddress =
      config.shadowAccountAnonymizerAddress;
  }

  const transfers = sdk.createPrivateTransfers(params);

  revocations.set(transfers, () => {
    revoked = true;
    viewingKey = undefined;
  });

  return transfers;
}
