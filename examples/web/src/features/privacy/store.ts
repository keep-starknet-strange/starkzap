import { writable, get } from "svelte/store";
import {
  Amount,
  fromAddress,
  TongoConfidential,
  type ConfidentialRecipient,
} from "starkzap";
import type { Call, RpcProvider } from "starknet";
import { walletState } from "~/lib/stores/wallet";
import { log } from "~/lib/stores/logger";
import { privacyTokens, type PrivacyToken } from "./tokens";

// Mints a confidential account for a token; set at login so it closes over the
// private key without the store ever holding it as plain state.
type Make = (
  token: PrivacyToken,
  rpc: RpcProvider
) => Promise<TongoConfidential>;

let make: Make | null = null; // null unless logged in with a private key

export const tokenSymbol = writable("");
export const instance = writable<TongoConfidential | null>(null);
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
  make = (tok, rpc) =>
    TongoConfidential.create({
      privateKey,
      contractAddress: fromAddress(tok.contractAddress),
      // The monorepo resolves two identical `starknet` copies (one nested
      // under @cartridge/controller); bridge the nominal mismatch.
      provider: rpc as never,
    });
  enabled.set(true);
}
export function clear(): void {
  make = null;
  enabled.set(false);
  tokenSymbol.set("");
  reset();
}
export function setToken(symbol: string) {
  tokenSymbol.set(symbol);
  reset();
}

export async function connect(): Promise<void> {
  const { wallet } = get(walletState);
  const tok = privacyTokens().find((t) => t.symbol === get(tokenSymbol));
  if (!wallet || !make || !tok) return;
  connecting.set(true);
  error.set(null);
  try {
    // Dual `starknet` copies in the monorepo — same runtime type.
    const inst = await make(
      tok,
      wallet.getProvider() as unknown as RpcProvider
    );
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
  const roller = get(instance);
  if (!roller) return Promise.resolve();
  return run("Rollover", (_tok, wallet) =>
    roller.rollover({ sender: wallet.address })
  );
}
