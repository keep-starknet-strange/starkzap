import type { constants } from "starknet";
import type {
  DiscoveryProviderInterface,
  OhttpOption,
  ProofProviderInterface,
  PrivateTransfersInterface,
} from "@starkware-libs/starknet-privacy-sdk";

import { SignerAdapter } from "@/signer";
import type { PrivacyPaymasterConfig } from "@/privacy/paymaster";
import type { Wallet } from "@/wallet";
import { assertSafeHttpUrl } from "@/utils";
import { loadPrivacySdk, type PrivacySdkModule } from "@/privacy/runtime";
import {
  assertCanonicalViewingKey,
  assertDeterministicSigner,
  signatureDerivation,
  type ViewingKeyContext,
  type ViewingKeyDerivation,
} from "@/privacy/viewing-key";

/** Parameters accepted by the SDK's own factory. */
type CreatePrivateTransfersParams = Parameters<
  PrivacySdkModule["createPrivateTransfers"]
>[0];

/**
 * Validate a service URL and strip trailing slashes.
 *
 * The slash matters: the privacy SDK builds sub-paths by plain concatenation
 * (`${url}/ohttp-keys`), so `https://host/` becomes `https://host//ohttp-keys`
 * and 404s from a fetch two layers below this call, naming neither the service
 * nor the cause. A path prefix is kept — the SDK supports a gateway mounted
 * under one.
 */
function asBaseUrl(value: string, label: string): string {
  assertSafeHttpUrl(value, label);
  return value.trim().replace(/\/+$/, "");
}

/**
 * Validate the OHTTP relay URL, which nothing else checks.
 * Every other field of `OhttpOption` passes through untouched.
 */
function normalizeOhttp(
  option: OhttpOption | undefined
): OhttpOption | undefined {
  if (option === undefined || typeof option === "boolean") return option;
  if (option.relayUrl === undefined) return option;

  return {
    ...option,
    relayUrl: asBaseUrl(option.relayUrl, "Privacy OHTTP relay URL"),
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
   * Passing an instance is how tests substitute the privacy SDK's
   * `MockProofProvider`, and how an integrator plugs in their own prover.
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
   * Without it the viewing key travels to both services in plaintext (inside
   * TLS, but readable by the service operator). Pass `true` for defaults, or an
   * object to pin a key config or route through a relay.
   *
   * Ignored for whichever of `prover` / `discovery` is given as an instance —
   * an instance owns its own transport.
   *
   * Both services have to support OHTTP. Against one that does not, the SDK's
   * `GET /ohttp-keys` fetch fails and calls throw, so leave this unset rather
   * than aim it at a plaintext deployment.
   */
  ohttp?: OhttpOption;
  /**
   * Sub-account anonymizer contract address. Only needed for `subaccounts(...)`.
   */
  subAccountAnonymizerAddress?: string;
  /**
   * Override how proof invocations are constructed.
   *
   * Only needed alongside a mock prover — the SDK's `MockProofProvider`
   * expects invocations built by its `MockProofInvocationFactory` rather than
   * real serialized calldata.
   */
  proofInvocationFactory?: CreatePrivateTransfersParams["proofInvocationFactory"];
  /**
   * Submission through a paymaster's relayer, which is what keeps the account
   * off-chain. Endpoint and fee mode travel together — see
   * {@link PrivacyPaymasterConfig}.
   *
   * Ignored by {@link createPrivacy} itself, which composes and proves but never
   * submits. It is read when the config reaches {@link Wallet.privacy()} or
   * `withPaymaster`, both of which require it.
   *
   * Omit it to submit through your own infrastructure. The only route left
   * inside the SDK is then
   * `wallet.execute(calls, { proof, unsafeUserPays: true })`, which puts the
   * sender's address, nonce and gas payment on-chain and so undoes the privacy
   * the pool provides.
   */
  paymaster?: PrivacyPaymasterConfig;
  /**
   * How the viewing key is derived for this account.
   *
   * Defaults to {@link signatureDerivation}, which needs nothing but
   * `signRaw`. Replace it to follow a different scheme like a wallet-native KDF,
   * a hardware device command, or an externally held key.
   *
   * The pool stores the first key an account registers and it cannot be
   * replaced, so changing this for an account that already registered orphans
   * its notes. The discovery service rejects a mismatched key outright.
   */
  viewingKeyDerivation?: ViewingKeyDerivation;
}

/**
 * Create a privacy pool client bound to a starkzap wallet.
 *
 * Returns the privacy SDK's own {@link PrivateTransfersInterface} rather than
 * a wrapper, so the fluent builder, discovery and history APIs are used
 * exactly as the SDK documents them. What this function adds is the glue
 * starkzap is responsible for: deriving the viewing key from the account's
 * signer, bridging that signer to the one the SDK expects, resolving the
 * chain, and refusing wallets that cannot support the flow.
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
 * A privacy call can never be batched with other calls as the proof belongs to
 * the transaction, not the call. So it cannot go through {@link TxBuilder}.
 *
 * Two prerequisites are the caller's responsibility, because this layer stays a
 * pass-through rather than sequencing transactions on your behalf:
 *
 * - **Depositing needs a prior ERC20 approve to the pool.** Neither this
 *   function nor the privacy SDK builds one, so send it separately
 *   (`wallet.tx().approve(token, pool, amount).send()`) or the deposit reverts
 *   on-chain. It does *not* have to age: the allowance is spent when the
 *   transaction executes rather than when it is proven. Note this differs from
 *   {@link TongoConfidential.fund}, which bundles its own approve.
 *
 *   Needing a *separate* transaction is this layer's limitation, not the
 *   protocol's. AVNU's paymaster has a second transaction type,
 *   `invoke_and_apply_action`, which wraps a user call in an outside-execution
 *   and relays it alongside the pool action — so the approve and the deposit
 *   land together, without the extra transaction or the wait between them.
 *   {@link PrivacyPaymaster} implements `apply_action` only.
 * - **On-chain state a proof *reads* must be ~10 blocks old.** That covers a
 *   top-up before a deposit, the account's own deployment before `register()`,
 *   and the previous privacy transaction — but not the approve above. Use
 *   {@link waitForFundedBalance} or {@link waitForProvableBlock} and pass the
 *   result as `provingBlockId`.
 *
 * @param wallet - A locally-signed wallet. `CartridgeWallet` is not accepted:
 *   it has no {@link AccountProvider}, so it cannot produce the viewing key.
 * @param config - Pool address and service endpoints
 * @returns The privacy SDK client
 * @throws If the optional peer dependency is not installed. Deriving the
 *   viewing key throws separately, on first use — see
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

  // The default derivation's precondition is checkable without signing, so
  // check it here rather than letting the first private operation fail. A
  // custom derivation owns its own preconditions.
  if (config.viewingKeyDerivation === undefined) {
    assertDeterministicSigner(signer);
  }

  // Validated before the SDK is loaded, so a bad URL fails without touching the
  // network or the optional dependency.
  const prover =
    typeof config.prover === "string"
      ? asBaseUrl(config.prover, "Privacy proving service URL")
      : config.prover;
  const discovery =
    typeof config.discovery === "string"
      ? asBaseUrl(config.discovery, "Privacy discovery service URL")
      : config.discovery;
  const ohttp = normalizeOhttp(config.ohttp);

  const sdk = await loadPrivacySdk();

  const chainId = wallet.getChainId().toFelt252() as constants.StarknetChainId;

  const derive = config.viewingKeyDerivation ?? signatureDerivation;
  const context: ViewingKeyContext = {
    chainId,
    accountAddress: wallet.address,
    poolAddress: config.poolContractAddress,
  };

  // Derived once per client and held in the closure rather than persisted, so
  // it lives exactly as long as the session that authorised it. Whether the key
  // matches the one the pool registered is left to the discovery service, which
  // rejects a mismatch outright.
  let viewingKey: string | undefined;
  const getViewingKey = async (): Promise<string> => {
    if (viewingKey === undefined) {
      const derived = await derive(context, signer);
      assertCanonicalViewingKey(derived);
      viewingKey = derived;
    }
    return viewingKey;
  };

  return sdk.createPrivateTransfers({
    account: {
      address: wallet.address,
      // The SDK signs a synthetic invocation whose sender is the pool, so it
      // needs the full starknet.js signer surface, not starkzap's minimal one.
      signer: new SignerAdapter(signer),
    },
    viewingKeyProvider: { getViewingKey },
    provingProvider:
      typeof prover === "string"
        ? {
            url: prover,
            chainId,
            ...(ohttp !== undefined && { ohttp }),
          }
        : prover,
    discoveryProvider:
      typeof discovery === "string"
        ? new sdk.IndexerDiscoveryProvider(
            discovery,
            config.poolContractAddress,
            { ...(ohttp !== undefined && { ohttp }) }
          )
        : discovery,
    ...(config.proofInvocationFactory !== undefined && {
      proofInvocationFactory: config.proofInvocationFactory,
    }),
    poolContractAddress: config.poolContractAddress,
    ...(config.subAccountAnonymizerAddress !== undefined && {
      subAccountAnonymizerAddress: config.subAccountAnonymizerAddress,
    }),
  });
}
