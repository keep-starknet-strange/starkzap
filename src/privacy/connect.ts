import type { Wallet } from "@/wallet";
import { fromAddress } from "@/types";
import {
  createPrivacy,
  revokePrivacy,
  type PrivacyConfig,
} from "@/privacy/create";
import { withPaymaster, type PrivacyClient } from "@/privacy/client";

/**
 * One client per wallet, so repeated calls do not derive the viewing key again.
 *
 * The promise is cached, so concurrent callers share one derivation.
 */
const clients = new WeakMap<Wallet, Promise<PrivacyClient>>();

/**
 * Privacy pool client for a wallet, bound to the paymaster that submits for it.
 *
 * The client handles the pool fee, the proving block and the submission. See
 * {@link PrivacyClient}. The relayer submits, so the account never appears on
 * chain, unless you pass `invoke` to `send`.
 *
 * ## Versus `createPrivacy`
 *
 * | Aspect | `connectPrivacy` | `createPrivacy` |
 * | --- | --- | --- |
 * | Returns | this wrapper | the SDK's own `PrivateTransfersInterface` |
 * | Submission | through the paymaster's relayer | yours to arrange |
 * | Cached per wallet | yes | no |
 * | Revoked on `wallet.disconnect()` | yes | no, call `revokePrivacy` yourself |
 *
 * Use `createPrivacy` only for a flow this wrapper does not model, such as a
 * private swap.
 *
 * @param wallet - Locally-signed wallet whose signer derives the viewing key
 * @param config - Pool, services and paymaster. Read once per wallet. Later
 *   calls return the cached client and ignore it.
 * @returns The paymaster-bound client, cached for this wallet
 * @throws If `config.paymaster` is missing
 *
 * @example
 * ```ts
 * import { StarkZap } from "starkzap";
 * import { connectPrivacy } from "starkzap/privacy";
 *
 * const wallet = await sdk.connectWallet({ account: { signer } });
 * const privacy = await connectPrivacy(wallet, {
 *   poolContractAddress: POOL,
 *   prover: "https://prover.example.com",
 *   discovery: "https://discovery.example.com",
 *   paymaster: {
 *     url: "https://paymaster.example.com",
 *     fee: { mode: "sponsored" },
 *     // Both required. See `PrivacyPaymasterConfig`.
 *     maxFee: 10n ** 19n,
 *     allowedFeeRecipients: [FORWARDER],
 *   },
 * });
 *
 * const { transactionHash } = await privacy.send((b) =>
 *   b.with(STRK, (t) => t.transfer({ recipient: bob, amount })).surplusTo(wallet.address)
 * );
 *
 * // Revokes the privacy client too.
 * await wallet.disconnect();
 * ```
 */
export async function connectPrivacy(
  wallet: Wallet,
  config: PrivacyConfig
): Promise<PrivacyClient> {
  const cached = clients.get(wallet);
  if (cached) return cached;

  const building = build(wallet, config).catch((error: unknown) => {
    // Not cached on failure, so the caller can retry.
    clients.delete(wallet);
    throw error;
  });
  clients.set(wallet, building);

  // Registered before the client exists, so a disconnect during derivation
  // still revokes the key.
  wallet.addRevocable(async () => {
    clients.delete(wallet);
    await building.then(
      (privacy) => revokePrivacy(privacy.transfers),
      () => undefined
    );
  });

  // Lets `wallet.execute({ proof })` read this pool's proof validity window.
  wallet.setPrivacyPool(fromAddress(config.poolContractAddress));

  return building;
}

/** Bind a privacy SDK client to the configured paymaster. */
async function build(
  wallet: Wallet,
  config: PrivacyConfig
): Promise<PrivacyClient> {
  // The fee mode is never defaulted. `default` mode overcharges compared to
  // `sponsored`, so the caller must choose.
  if (!config.paymaster) {
    throw new Error(
      "[starkzap] `privacy.paymaster` is required. A paymaster's relayer " +
        "submits private transactions. Use `{ url, fee: { mode: " +
        '"sponsored" }, maxFee, allowedFeeRecipients }` (the relayer pays gas ' +
        "and needs an API key, so point `url` at a proxy that holds it), or " +
        '`{ url, fee: { mode: "default", gasToken }, maxFee, ' +
        "allowedFeeRecipients }` (no key, but the withdrawal takes the full " +
        "suggested-max gas). `maxFee` caps what a quote may withdraw. " +
        "`allowedFeeRecipients` names who may receive it. Both are required."
    );
  }

  const transfers = await createPrivacy(wallet, config);

  return withPaymaster(transfers, {
    ...config.paymaster,
    poolContractAddress: config.poolContractAddress,
    provider: wallet.getProvider(),
    chainId: wallet.getChainId(),
    ...(config.allowInsecureHttp && { allowInsecureHttp: true }),
    // Only for `send({ invoke })`. The private path never signs.
    account: {
      address: wallet.address,
      signTypedData: (typedData) => wallet.signMessage(typedData),
    },
  });
}
