import { writable, get } from "svelte/store";
import {
  Amount,
  fromAddress,
  type ConfidentialProvider,
  type ConfidentialRecipient,
  type ConfidentialRolloverDetails,
} from "starkzap";
import type { Call, RpcProvider } from "starknet";
import { walletState } from "~/lib/stores/wallet";
import { log } from "~/lib/stores/logger";
import {
  PRIVACY_PROVIDERS,
  type PrivacyProviderDef,
  type PrivacyToken,
} from "./providers";

// rollover is a Tongo extra, not part of the base ConfidentialProvider — treat
// it as an optional capability so other providers (e.g. STRK20) can omit it.
type MaybeRollover = {
  rollover?: (details: ConfidentialRolloverDetails) => Promise<Call[]>;
};

// Mints a confidential provider for a token; set at login so it closes over the
// private key without the store ever holding it as plain state.
type Make = (
  def: PrivacyProviderDef,
  token: PrivacyToken,
  rpc: RpcProvider
) => ConfidentialProvider;

let make: Make | null = null; // null unless logged in with a private key

export const providerId = writable(PRIVACY_PROVIDERS[0]?.id ?? "tongo");
export const tokenSymbol = writable("");
export const instance = writable<ConfidentialProvider | null>(null);
export const token = writable<PrivacyToken | null>(null);
export const connecting = writable(false);
export const busy = writable(false);
export const address = writable("");
export const recipient = writable<ConfidentialRecipient | null>(null);
export const balance = writable(0n);
export const pending = writable(0n);
export const error = writable<string | null>(null);
// True when a private-key login established the capability.
export const enabled = writable(false);

function reset() {
  instance.set(null);
  token.set(null);
  address.set("");
  recipient.set(null);
  balance.set(0n);
  pending.set(0n);
  error.set(null);
}

// Called from the wallet store on private-key connect.
export function init(privateKey: string): void {
  make = (def, tok, rpc) =>
    def.create({ token: tok, privateKey, provider: rpc });
  enabled.set(true);
}
export function clear(): void {
  make = null;
  enabled.set(false);
  tokenSymbol.set("");
  reset();
}
export function setProvider(id: string) {
  providerId.set(id);
  reset();
}
export function setToken(symbol: string) {
  tokenSymbol.set(symbol);
  reset();
}

export async function connect(): Promise<void> {
  const { wallet } = get(walletState);
  const def = PRIVACY_PROVIDERS.find((p) => p.id === get(providerId));
  const tok = def?.tokens().find((t) => t.symbol === get(tokenSymbol));
  if (!wallet || !make || !def || !tok) return;
  connecting.set(true);
  error.set(null);
  try {
    // Dual `starknet` copies in the monorepo — same runtime type.
    const inst = make(def, tok, wallet.getProvider() as unknown as RpcProvider);
    instance.set(inst);
    token.set(tok);
    address.set(inst.address);
    recipient.set(inst.recipientId);
    await refresh();
  } catch (err) {
    error.set(String(err));
    instance.set(null);
  } finally {
    connecting.set(false);
  }
}

export async function refresh(): Promise<void> {
  const inst = get(instance);
  if (!inst) return;
  try {
    const state = await inst.getState();
    const [bal, pend] = await Promise.all([
      inst.toPublicUnits(state.balance),
      inst.toPublicUnits(state.pending),
    ]);
    balance.set(bal);
    pending.set(pend);
  } catch (err) {
    error.set(String(err));
  }
}

async function run(
  label: string,
  buildCalls: (
    t: PrivacyToken,
    w: NonNullable<ReturnType<typeof getWallet>>
  ) => Promise<Call[]>
): Promise<void> {
  const wallet = getWallet();
  const inst = get(instance);
  const tok = get(token);
  if (!wallet || !inst || !tok) return;
  busy.set(true);
  try {
    log(`${label}…`, "info");
    const calls = await buildCalls(tok, wallet);
    const tx = await wallet.execute(calls);
    await tx.wait();
    await refresh();
  } catch (err) {
    log(`${label} failed: ${err}`, "error");
    error.set(String(err));
  } finally {
    busy.set(false);
  }
}

function getWallet() {
  return get(walletState).wallet;
}

export function fund(amount: string): Promise<void> {
  if (!amount.trim()) return Promise.resolve();
  return run("Shield", (tok, wallet) =>
    get(instance)!.fund({
      amount: Amount.parse(amount, tok.decimals, tok.symbol),
      sender: wallet.address,
    })
  );
}

// Unshield always returns funds to our own wallet address.
export function withdraw(amount: string): Promise<void> {
  if (!amount.trim()) return Promise.resolve();
  return run("Unshield", (tok, wallet) =>
    get(instance)!.withdraw({
      amount: Amount.parse(amount, tok.decimals, tok.symbol),
      to: fromAddress(wallet.address),
      sender: wallet.address,
    })
  );
}

export function transfer(amount: string, toAddress: string): Promise<void> {
  if (!amount.trim() || !toAddress.trim()) return Promise.resolve();
  return run("Private send", (tok, wallet) => {
    const inst = get(instance)!;
    return inst.transfer({
      amount: Amount.parse(amount, tok.decimals, tok.symbol),
      // Accept a single shareable public key and decode it to {x, y}.
      to: inst.recipientFromAddress(toAddress),
      sender: wallet.address,
    });
  });
}

export function rollover(): Promise<void> {
  const roller = get(instance) as (ConfidentialProvider & MaybeRollover) | null;
  if (!roller?.rollover) return Promise.resolve();
  return run("Rollover", (_tok, wallet) =>
    roller.rollover!({ sender: wallet.address })
  );
}
