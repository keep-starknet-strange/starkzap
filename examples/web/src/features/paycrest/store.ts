import { writable, get } from "svelte/store";
import {
  Amount,
  fromAddress,
  Paycrest,
  PaycrestOrderError,
  type PaycrestCurrency,
  type PaycrestInstitution,
  type PaycrestToken,
  type Token,
  type WalletInterface,
} from "starkzap";
import { walletState } from "~/lib/stores/wallet";
import { log } from "~/lib/stores/logger";
import { feeOptions } from "~/lib/stores/settings";
import { PAYCREST_API_BASE } from "~/lib/stores/config";

// Paycrest fiat ramp (mainnet only). Orders go through wallet.offramp /
// wallet.onramp, which use the Paycrest client built from the SDK config in
// wallet.ts. The list and rate endpoints are public, so a keyless client
// fills the form before anything is submitted.
const reads = new Paycrest({ apiBaseUrl: PAYCREST_API_BASE });

export type Direction = "offramp" | "onramp";

export const direction = writable<Direction>("offramp");
export const tokenSymbol = writable("");
export const amount = writable("0.5"); // stablecoin, off-ramp
export const fiatAmount = writable("1000"); // fiat, on-ramp
export const currency = writable("");
export const institution = writable("");
export const accountIdentifier = writable("");
export const accountName = writable("");
export const memo = writable("");

export const tokens = writable<PaycrestToken[]>([]);
export const currencies = writable<PaycrestCurrency[]>([]);
export const institutions = writable<PaycrestInstitution[]>([]);
export const quote = writable("");
export const submitting = writable(false);
export const output = writable<string[]>([]);
export const outcome = writable<"ok" | "err" | null>(null);

export async function init(): Promise<void> {
  if (get(tokens).length) return;
  try {
    const [t, c] = await Promise.all([
      reads.listTokens("starknet"),
      reads.listCurrencies(),
    ]);
    tokens.set(t);
    currencies.set(c);
    if (!get(tokenSymbol)) tokenSymbol.set(t[0]?.symbol ?? "");
    if (!get(currency)) {
      currency.set(c.find((x) => x.code === "NGN")?.code ?? c[0]?.code ?? "");
    }
  } catch (err) {
    log(`Paycrest: failed to load tokens/currencies: ${err}`, "error");
  }
}

export async function loadInstitutions(code: string): Promise<void> {
  institutions.set([]);
  institution.set("");
  if (!code) return;
  try {
    const list = await reads.listInstitutions(code);
    // Ignore a stale response if the currency changed while loading.
    if (get(currency) !== code) return;
    institutions.set(list);
    institution.set(list[0]?.code ?? "");
  } catch (err) {
    log(`Paycrest: failed to load institutions: ${err}`, "error");
  }
}

/**
 * Indicative rate for the current inputs: the `sell` side against the
 * stablecoin amount for an off-ramp, `buy` against the fiat amount for an
 * on-ramp. The real rate is fixed when the order is created.
 */
export async function fetchQuote(): Promise<void> {
  const onramp = get(direction) === "onramp";
  const token = get(tokenSymbol);
  const fiat = get(currency);
  const raw = (onramp ? get(fiatAmount) : get(amount)).trim();
  const value = Number(raw);
  if (!token || !fiat || !raw || !Number.isFinite(value) || value <= 0) {
    quote.set("");
    return;
  }
  quote.set("Fetching rate…");
  try {
    const res = await reads.getRate({
      network: "starknet",
      token,
      amount: raw,
      fiat,
      side: onramp ? "buy" : "sell",
    });
    const rate = Number((onramp ? res.buy : res.sell)?.rate);
    if (!Number.isFinite(rate) || rate <= 0) {
      quote.set("Rate unavailable for this pair/amount.");
      return;
    }
    quote.set(
      onramp
        ? `1 ${token} ≈ ${rate} ${fiat} · you receive ≈ ${(value / rate).toFixed(4)} ${token}`
        : `1 ${token} ≈ ${rate} ${fiat} · you receive ≈ ${(value * rate).toFixed(2)} ${fiat}`
    );
  } catch (err) {
    // e.g. "no provider available" when Paycrest has no liquidity for the pair.
    quote.set(`Rate unavailable: ${err instanceof Error ? err.message : err}`);
  }
}

// SDK Token from the Paycrest wire token (address, decimals, symbol).
function selectedToken(): Token {
  const wire = get(tokens).find((t) => t.symbol === get(tokenSymbol));
  if (!wire) throw new Error("Token list hasn't loaded yet.");
  return {
    name: wire.symbol,
    symbol: wire.symbol,
    decimals: wire.decimals,
    address: fromAddress(wire.contractAddress),
  };
}

function account() {
  return {
    institution: get(institution).trim(),
    accountIdentifier: get(accountIdentifier).trim(),
    accountName: get(accountName).trim(),
  };
}

const print = (...lines: string[]) => output.update((o) => [...o, ...lines]);

export async function submit(): Promise<void> {
  const { wallet } = get(walletState);
  if (!wallet) return;
  submitting.set(true);
  output.set([]);
  outcome.set(null);
  try {
    if (get(direction) === "onramp") await onramp(wallet);
    else await offramp(wallet);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    print(msg);
    outcome.set("err");
    log(`Paycrest error: ${msg}`, "error");
  } finally {
    submitting.set(false);
  }
}

async function offramp(wallet: WalletInterface): Promise<void> {
  const token = selectedToken();
  const note = get(memo).trim();
  print("Creating off-ramp order…");
  const result = await wallet.offramp(
    {
      from: { token, amount: Amount.parse(get(amount).trim(), token) },
      to: {
        currency: get(currency),
        recipient: { ...account(), ...(note ? { memo: note } : {}) },
      },
      reference: `web-offramp-${Date.now()}`,
    },
    feeOptions()
  );
  print(
    `orderId: ${result.orderId}`,
    `receiveAddress: ${result.receiveAddress}`,
    `transfer tx: ${result.tx.hash}`,
    "Waiting for settlement (this can take a while)…"
  );
  log(`Paycrest off-ramp order ${result.orderId} funded`, "success");
  try {
    const order = await result.wait();
    print(`final status: ${order.status}`);
    outcome.set("ok");
  } catch (err) {
    if (err instanceof PaycrestOrderError) {
      // Status only: err.order carries the recipient's bank details.
      print(`order ended in: ${err.order.status}`);
      outcome.set("err");
      return;
    }
    throw err;
  }
}

async function onramp(wallet: WalletInterface): Promise<void> {
  print("Creating on-ramp order…");
  // The recipient defaults to the connected wallet's address.
  const result = await wallet.onramp({
    from: {
      currency: get(currency),
      amount: get(fiatAmount).trim(),
      refundAccount: account(),
    },
    to: { token: selectedToken() },
    reference: `web-onramp-${Date.now()}`,
  });
  const a = result.providerAccount;
  print(
    "Pay this account to fund your wallet:",
    `  bank:    ${a.institution ?? "—"}`,
    `  account: ${a.accountIdentifier ?? "—"}`,
    `  name:    ${a.accountName ?? "—"}`,
    `  amount:  ${a.amountToTransfer ?? "—"} ${a.currency ?? ""}`,
    `  expires: ${result.validUntil ?? "—"}`,
    `  orderId: ${result.orderId}`
  );
  outcome.set("ok");
  log(`Paycrest on-ramp order ${result.orderId} created`, "success");
}
