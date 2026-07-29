import type { constants } from "starknet";
import type {
  DiscoveryProviderInterface,
  OhttpOption,
  ProofProviderInterface,
  PrivateTransfersInterface,
} from "@starkware-libs/starknet-privacy-sdk";

import { SignerAdapter } from "@/signer";
import type { PrivacyFeeMode, PrivacyTip } from "@/privacy/paymaster";
import type { Wallet } from "@/wallet";
import { assertSafeHttpUrl } from "@/utils";
import { loadPrivacySdk, type PrivacySdkModule } from "@/privacy/runtime";

/** Parameters accepted by the SDK's own factory. */
type CreatePrivateTransfersParams = Parameters<
  PrivacySdkModule["createPrivateTransfers"]
>[0];

/** Configuration for {@link createPrivacy}. */
export interface PrivacyConfig {
  /**
   * Privacy pool contract address.
   *
   * Used verbatim when deriving the viewing key, so it must byte-match the
   * form other wallets use for the same pool — `0x040...` and `0x40...`
   * derive different keys and make existing notes undiscoverable.
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
   * Without it the viewing key travels to those services in plaintext (inside
   * TLS, but readable by the service operator). Pass `true` for defaults, or
   * an object to pin a key config or route through a relay.
   *
   * Ignored when `prover` is an instance — the instance owns its transport.
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
   * Paymaster endpoint used to submit private transactions.
   *
   * Point this at a proxy that holds the API key rather than at the paymaster
   * itself. `sponsored` and `sponsored_private` need one. `default` mode
   * needs no key.
   *
   * Without it, privacy transactions can only be self-submitted via
   * `wallet.execute(calls, { proof, unsafeUserPays: true })`, which puts the
   * sender's address, nonce and gas payment on-chain and so undoes the privacy
   * the pool provides.
   */
  paymasterUrl?: string;
  /**
   * How the fee is paid. Defaults to `default` mode with STRK as the gas token,
   * which is the only mode that needs no paymaster API key.
   *
   * All modes withdraw the fee from the shielded balance and are submitted by
   * the relayer, so the choice is about cost, not about privacy.
   */
  fee?: PrivacyFeeMode;
  /** Optional transaction priority passed through to the paymaster. */
  tip?: PrivacyTip;
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
 *   function nor the privacy SDK builds one, and the approve cannot share the
 *   privacy transaction — the proof owns it. Send it separately
 *   (`wallet.tx().approve(token, pool, amount).send()`) or the deposit reverts
 *   on-chain. Note this differs from {@link TongoConfidential.fund}, which does
 *   bundle its own approve.
 * - **Any on-chain state a proof reads must be ~10 blocks old.** That covers a
 *   preceding approve or top-up, the account's own deployment before
 *   `register()`, and the previous privacy transaction. Use
 *   {@link waitForProvableBlock} and pass the result as `provingBlockId`.
 *
 * @param wallet - A locally-signed wallet. `CartridgeWallet` is not accepted:
 *   it has no {@link AccountProvider}, so it cannot produce the viewing key.
 * @param config - Pool address and service endpoints
 * @returns The privacy SDK client
 * @throws If the wallet's signer does not declare `deterministic: true`, or the
 *   optional peer dependency is not installed
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
  const accountProvider = wallet.getAccountProvider();
  const signer = accountProvider.getSigner();

  // The viewing key is a fold of an ECDSA signature over a fixed message, so
  // it is only reproducible when the signer's nonce is deterministic
  // (RFC-6979). A signer that draws a fresh nonce per signature would derive a
  // different key on every call, leaving every existing note undecryptable.
  if (signer.deterministic !== true) {
    throw new Error(
      "[starkzap] Privacy pool operations require a signer that declares " +
        "`deterministic: true` — the viewing key is derived from a signature, so a " +
        "signer with a random ECDSA nonce would derive a different key each call and " +
        "lose access to previously encrypted notes. StarkSigner declares it; Privy " +
        "and Cartridge signers do not, because their nonce policy is not ours to verify."
    );
  }

  if (typeof config.prover === "string") {
    assertSafeHttpUrl(config.prover, "Privacy proving service URL");
  }
  if (typeof config.discovery === "string") {
    assertSafeHttpUrl(config.discovery, "Privacy discovery service URL");
  }

  const sdk = await loadPrivacySdk();

  const chainId = wallet.getChainId().toFelt252() as constants.StarknetChainId;

  return sdk.createPrivateTransfers({
    account: {
      address: wallet.address,
      // The SDK signs a synthetic invocation whose sender is the pool, so it
      // needs the full starknet.js signer surface, not starkzap's minimal one.
      signer: new SignerAdapter(signer),
    },
    viewingKeyProvider: {
      getViewingKey: async () => {
        return await accountProvider.getViewingKey({
          chainId,
          poolAddress: config.poolContractAddress,
        });
      },
    },
    provingProvider:
      typeof config.prover === "string"
        ? {
            url: config.prover,
            chainId,
            ...(config.ohttp !== undefined && { ohttp: config.ohttp }),
          }
        : config.prover,
    discoveryProvider:
      typeof config.discovery === "string"
        ? { url: config.discovery }
        : config.discovery,
    ...(config.proofInvocationFactory !== undefined && {
      proofInvocationFactory: config.proofInvocationFactory,
    }),
    poolContractAddress: config.poolContractAddress,
    ...(config.subAccountAnonymizerAddress !== undefined && {
      subAccountAnonymizerAddress: config.subAccountAnonymizerAddress,
    }),
  });
}
