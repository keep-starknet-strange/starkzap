import type { Wallet } from "@/wallet";
import { fromAddress } from "@/types";
import {
  createPrivacy,
  revokePrivacy,
  type PrivacyConfig,
} from "@/privacy/create";
import { withPaymaster, type PrivacyClient } from "@/privacy/client";

/**
 * One client per wallet, so repeated calls neither re-derive the viewing key nor
 * ask the user to sign again.
 *
 * Keyed weakly: a wallet that goes out of scope takes its client with it. The
 * promise is cached rather than the client, so concurrent callers share one
 * derivation instead of racing.
 */
const clients = new WeakMap<Wallet, Promise<PrivacyClient>>();

/**
 * Privacy pool client for a wallet, bound to the paymaster that submits for it.
 *
 * The client owns the pool fee, the proving block and submission — see
 * {@link PrivacyClient}. Submission goes through the paymaster's relayer, so the
 * account never appears on chain; self-submitting would defeat the point.
 *
 * ## Versus `createPrivacy`
 *
 * Both derive the same viewing key from the same signer. The difference is what
 * they return and who cleans up:
 *
 * | | `connectPrivacy` | `createPrivacy` |
 * | --- | --- | --- |
 * | Returns | this wrapper: fee, proving block, relayed submission | the privacy SDK's own `PrivateTransfersInterface`, unwrapped |
 * | Submission | through the paymaster's relayer | yours to arrange |
 * | Cached per wallet | yes | no — each call derives again |
 * | Revoked on `wallet.disconnect()` | **yes, automatically** | **no — call `revokePrivacy` yourself** |
 *
 * Reach for `createPrivacy` when you need the SDK's own surface, for a flow this
 * wrapper does not model — a private swap, say. Everything else wants this
 * function. Either way the viewing key must not outlive the session that
 * authorised it, which this one handles for you.
 *
 * @param wallet - Locally-signed wallet whose signer derives the viewing key
 * @param config - Pool, services and paymaster. Read once per wallet: later
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
 *   paymaster: { url: "https://paymaster.example.com", fee: { mode: "sponsored" } },
 * });
 *
 * const { transactionHash } = await privacy.send((b) =>
 *   b.with(STRK, (t) => t.transfer({ recipient: bob, amount })).surplusTo(wallet.address)
 * );
 *
 * // Revoked with the session, no bookkeeping required.
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
    // Not cached on failure: a missing dependency or an unreachable service
    // should be retryable once fixed.
    clients.delete(wallet);
    throw error;
  });
  clients.set(wallet, building);

  // Registered before the client exists, so a disconnect during derivation still
  // revokes the key it was deriving.
  wallet.addRevocable(async () => {
    clients.delete(wallet);
    await building.then(
      (privacy) => revokePrivacy(privacy.transfers),
      () => undefined
    );
  });

  // Lets `wallet.execute({ proof })` read this pool's own proof validity window
  // rather than falling back to a built-in one. Parsed here because the config
  // takes a plain string, and this is the boundary where it becomes an address.
  wallet.setPrivacyPool(fromAddress(config.poolContractAddress));

  return building;
}

/** Bind a privacy SDK client to the configured paymaster. */
async function build(
  wallet: Wallet,
  config: PrivacyConfig
): Promise<PrivacyClient> {
  // One check, not two: `PrivacyPaymasterConfig` carries the endpoint and the
  // fee mode together, so there is no half-configured state to reject. The fee
  // mode is never defaulted — `default` needs no API key but its withdrawal
  // takes the suggested *maximum* gas rather than the estimate, so choosing it
  // unasked would overcharge on the user's behalf.
  if (!config.paymaster) {
    throw new Error(
      "[starkzap] Privacy transactions are submitted by a paymaster's relayer, " +
        "so `privacy.paymaster` is required. Use `{ url, fee: { mode: " +
        '"sponsored" } }` (relayer pays gas, pool fee in STRK — needs an API ' +
        "key, so point `url` at a proxy holding it), or `{ url, fee: { mode: " +
        '"default", gasToken } }` (no key, but the withdrawal takes the full ' +
        "suggested-max gas rather than refunding the unused part)."
    );
  }

  const transfers = await createPrivacy(wallet, config);

  return withPaymaster(transfers, {
    ...config.paymaster,
    poolContractAddress: config.poolContractAddress,
    provider: wallet.getProvider(),
    chainId: wallet.getChainId(),
    // Only for `send({ invoke })`, which relays public calls alongside the
    // private transaction. The private path never signs: the proof authorises
    // it, which is what keeps this account off-chain.
    account: {
      address: wallet.address,
      signTypedData: (typedData) => wallet.signMessage(typedData),
    },
  });
}
