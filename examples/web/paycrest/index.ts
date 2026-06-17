/**
 * Paycrest fiat-ramp panel for the web example.
 *
 * Unlike the Node scripts in `examples/paycrest/`, this does NOT build its
 * own wallet — it uses the wallet the user already connected in the main
 * app (Cartridge / injected / private-key). The connected wallet already
 * carries the provider (RPC) and account address, so the only thing this
 * feature needs is the Paycrest API key, which flows from the main SDK
 * config (`paycrest: { apiKey }`) into `wallet.offramp` / `wallet.onramp`.
 *
 * Call `initPaycrestPanel(() => currentWallet)` once at startup; the panel
 * reads the current wallet lazily on each submit.
 *
 * Paycrest is mainnet-only — connect a mainnet wallet (the SDK will throw
 * a clear error otherwise).
 */
import {
  Amount,
  fromAddress,
  Paycrest,
  PaycrestOrderError,
  type PaycrestToken,
  type Token,
  type WalletInterface,
} from "starkzap";

type GetWallet = () => WalletInterface | null;
// Matches the main app's `log` signature so it can be passed straight in.
type Log = (
  msg: string,
  level?: "default" | "error" | "info" | "success"
) => void;

interface PanelOptions {
  /** Same proxy base URL the wallet's Paycrest client uses (see main.ts). */
  apiBaseUrl?: string;
  /**
   * Whether a Paycrest API key is configured. When false, the panel shows
   * a disabled placeholder instead of the form (every order-creating call
   * needs the key).
   */
  enabled?: boolean;
  log?: Log;
}

export function initPaycrestPanel(
  getWallet: GetWallet,
  options: PanelOptions = {}
): void {
  const { apiBaseUrl, enabled = true, log } = options;
  // Append inside the app's centered column so it inherits the same
  // max-width, margins, and card spacing as the other views.
  const container = document.querySelector(".app") ?? document.body;

  if (!enabled) {
    container.appendChild(
      buildDisabledCard(
        "Paycrest ramp disabled — set VITE_PAYCREST_API_KEY in examples/web/.env to enable it."
      )
    );
    return;
  }

  const panel = buildPanel();
  container.appendChild(panel.root);

  // The list endpoints are public (no API key), so a read-only client is
  // enough to populate the dropdowns before any wallet is connected. It
  // shares the same same-origin proxy base URL to avoid CORS.
  const reads = new Paycrest(apiBaseUrl ? { apiBaseUrl } : {});
  // Populate the dropdowns, then fetch an initial rate once defaults exist.
  void populateLists(panel, reads, log).then(() =>
    updateRate(panel, reads, log)
  );

  // Live rate preview: refresh (debounced) as the relevant amount, token,
  // currency, or direction changes.
  const refreshRate = debounce(() => void updateRate(panel, reads, log), 400);
  panel.amount.addEventListener("input", refreshRate);
  panel.fiatAmount.addEventListener("input", refreshRate);
  panel.token.addEventListener("change", refreshRate);
  panel.currency.addEventListener("change", refreshRate);
  panel.direction.addEventListener("change", refreshRate);

  panel.submit.addEventListener("click", async () => {
    panel.submit.disabled = true;
    try {
      const wallet = getWallet();
      if (!wallet) {
        panel.print("Connect a wallet in the app first.", "err");
        return;
      }
      if (panel.direction.value === "onramp") {
        await runOnramp(wallet, panel);
      } else {
        await runOfframp(wallet, panel);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      panel.print(msg, "err");
      log?.(`Paycrest error: ${msg}`, "error");
      console.error(err);
    } finally {
      panel.submit.disabled = false;
    }
  });
}

async function runOfframp(wallet: WalletInterface, p: Panel): Promise<void> {
  const token = selectedToken(p);
  const path = p.path.value === "gateway" ? "gateway" : "api";
  p.print(`Submitting ${path} off-ramp…`);

  const memo = p.memo.value.trim();
  const result = await wallet.offramp({
    path,
    from: { token, amount: Amount.parse(p.amount.value.trim(), token) },
    to: {
      currency: p.currency.value.trim(),
      recipient: {
        institution: p.institution.value.trim(),
        accountIdentifier: p.account.value.trim(),
        accountName: p.name.value.trim(),
        ...(memo ? { memo } : {}),
      },
    },
    reference: `web-demo-${Date.now()}`,
  });

  p.append(`tx: ${result.tx.hash}`);
  const orderId = await result.orderId;
  p.append(`orderId: ${orderId ?? "<none — create_order may have reverted>"}`);
  if (result.path === "api")
    p.append(`receiveAddress: ${result.receiveAddress}`);
  if (result.path === "gateway") p.append(`rate: ${result.rate}`);

  p.append("Polling for settlement (this can take a while)…");
  try {
    const status = await result.wait();
    p.append(`final status: ${status.status}`);
    p.setClass("ok");
  } catch (err) {
    if (err instanceof PaycrestOrderError) {
      // Only the status — err.order carries recipient PII.
      p.append(`order ended in: ${err.order.status}`);
      p.setClass("err");
      return;
    }
    throw err;
  }
}

async function runOnramp(wallet: WalletInterface, p: Panel): Promise<void> {
  p.print("Submitting on-ramp…");
  // recipient defaults to the connected wallet's address inside onramp().
  const result = await wallet.onramp({
    from: {
      currency: p.currency.value.trim(),
      amount: Number(p.fiatAmount.value),
      refundAccount: {
        institution: p.institution.value.trim(),
        accountIdentifier: p.account.value.trim(),
        accountName: p.name.value.trim(),
      },
    },
    to: { token: selectedToken(p) },
    reference: `web-onramp-${Date.now()}`,
  });

  const acct = result.providerAccount;
  p.append(
    [
      "Pay this account to fund your wallet:",
      `  bank:    ${acct.institution}`,
      `  account: ${acct.accountIdentifier}`,
      `  name:    ${acct.accountName}`,
      `  amount:  ${acct.amountToTransfer} ${acct.currency}`,
      `  expires: ${result.validUntil}`,
      `  orderId: ${result.orderId}`,
    ].join("\n")
  );
  p.setClass("ok");
}

// Build an SDK `Token` from the selected Paycrest wire token. The SDK's
// offramp/onramp need an address + decimals + symbol; the list endpoint
// gives us all three, so we don't hardcode a preset.
function selectedToken(p: Panel): Token {
  const symbol = p.token.value;
  const wire = p.tokensBySymbol.get(symbol);
  if (!wire) {
    throw new Error(
      symbol
        ? `Token ${symbol} not found in the Paycrest token list.`
        : "Token list hasn't loaded yet — try again in a moment."
    );
  }
  return {
    name: wire.symbol,
    address: fromAddress(wire.contractAddress),
    decimals: wire.decimals,
    symbol: wire.symbol,
  };
}

// ---------------------------------------------------------------------------
//                            DOM construction
// ---------------------------------------------------------------------------

interface Panel {
  root: HTMLElement;
  direction: HTMLSelectElement;
  path: HTMLSelectElement;
  token: HTMLSelectElement;
  /** symbol → wire token, filled by populateLists for selectedToken(). */
  tokensBySymbol: Map<string, PaycrestToken>;
  amount: HTMLInputElement;
  fiatAmount: HTMLInputElement;
  currency: HTMLSelectElement;
  institution: HTMLSelectElement;
  account: HTMLInputElement;
  name: HTMLInputElement;
  memo: HTMLInputElement;
  /** Live rate preview line. */
  rate: HTMLElement;
  submit: HTMLButtonElement;
  print: (msg: string, cls?: string) => void;
  append: (msg: string) => void;
  setClass: (cls: string) => void;
}

// Disabled placeholder shown when no API key is configured. Matches the
// other views' card styling.
function buildDisabledCard(message: string): HTMLElement {
  const root = el("div", { className: "card" });
  root.appendChild(
    el("div", { className: "card-title", textContent: "Paycrest fiat ramp" })
  );
  root.appendChild(
    el("p", {
      textContent: message,
      style: "font-size:.9rem;color:var(--text-muted);margin:0",
    })
  );
  return root;
}

function buildPanel(): Panel {
  // Match the other views: a `.card` inside `.app` with a `.card-title`.
  const root = el("div", { className: "card" });
  root.appendChild(
    el("div", { className: "card-title", textContent: "Paycrest fiat ramp" })
  );
  root.appendChild(
    el("p", {
      textContent:
        "Uses the connected wallet. Mainnet only. Start with the API off-ramp path (no encryption).",
      style:
        "font-size:.85rem;color:var(--text-muted);margin:-0.5rem 0 1.25rem",
    })
  );

  const direction = select("direction", [
    ["offramp", "Off-ramp (stablecoin → fiat)"],
    ["onramp", "On-ramp (fiat → stablecoin)"],
  ]);
  const path = select("path", [
    ["api", "api (no encryption)"],
    ["gateway", "gateway (on-chain, encrypted)"],
  ]);
  // Token, currency, and institution are populated live from the Paycrest
  // list endpoints (see populateLists). They start as a disabled "Loading…"
  // placeholder; env vars are applied once the real options arrive.
  const token = select("token", [["", "Loading…"]]);
  const currency = select("currency", [["", "Loading…"]]);
  const institution = select("institution", [["", "Loading…"]]);
  // Amount keeps demo defaults but accepts env overrides.
  const amount = input("amount", {
    value: envVal("VITE_PAYCREST_AMOUNT") ?? "0.5",
  });
  const fiatAmount = input("fiatAmount", {
    value: envVal("VITE_PAYCREST_FIAT_AMOUNT") ?? "1000",
  });
  const account = input("account", {
    placeholder: "e.g. 0123456789",
    ...envValue("VITE_PAYCREST_RECIPIENT_ACCOUNT_IDENTIFIER"),
  });
  const name = input("name", {
    placeholder: "e.g. John Doe",
    ...envValue("VITE_PAYCREST_RECIPIENT_ACCOUNT_NAME"),
  });
  const memo = input("memo", {
    placeholder: "Optional payment memo",
    ...envValue("VITE_PAYCREST_MEMO"),
  });

  root.appendChild(field("Flow", direction));
  root.appendChild(field("Off-ramp path", path));
  root.appendChild(field("Stablecoin", token));
  // Stablecoin amount drives the off-ramp; fiat amount drives the on-ramp.
  // Paycrest supplies the rate/conversion for the other side, so only one
  // is shown at a time.
  const amountField = field("Stablecoin amount", amount);
  root.appendChild(amountField);
  const fiatField = field("Fiat amount", fiatAmount);
  root.appendChild(fiatField);
  root.appendChild(field("Fiat currency", currency));
  // Live rate preview, updated as the amount/token/currency change.
  const rate = el("div", {
    style:
      "font-size:.85rem;color:var(--text-secondary);margin:-0.25rem 0 0.75rem;min-height:1.1em",
  });
  root.appendChild(rate);
  root.appendChild(field("Institution (bank / mobile money)", institution));
  root.appendChild(field("Account number", account));
  root.appendChild(field("Account name", name));
  root.appendChild(field("Memo (off-ramp, optional)", memo));

  const submit = el("button", {
    className: "btn btn-primary",
    textContent: "Submit",
    style: "margin-top:1.25rem;width:100%",
  });
  root.appendChild(submit);

  // Reuse the app's `.quote-box` result-panel styling.
  const output = el("pre", {
    className: "quote-box",
    textContent: "Idle.",
    style: "white-space:pre-wrap;word-break:break-word;margin-top:1rem",
  });
  root.appendChild(output);

  // Toggle on/off-ramp specific inputs.
  const sync = (): void => {
    const onramp = direction.value === "onramp";
    path.disabled = onramp;
    // Off-ramp: stablecoin amount only. On-ramp: fiat amount only.
    amountField.style.display = onramp ? "none" : "block";
    fiatField.style.display = onramp ? "block" : "none";
  };
  direction.addEventListener("change", sync);
  sync();

  const setClass = (cls: string): void => {
    output.style.color =
      cls === "err"
        ? "var(--error)"
        : cls === "ok"
          ? "var(--accent-primary)"
          : "";
  };
  const print = (msg: string, cls?: string): void => {
    output.textContent = msg;
    setClass(cls ?? "");
  };
  const append = (msg: string): void => {
    output.textContent = `${output.textContent}\n${msg}`;
  };

  return {
    root,
    direction,
    path,
    token,
    tokensBySymbol: new Map<string, PaycrestToken>(),
    amount,
    fiatAmount,
    currency,
    institution,
    account,
    name,
    memo,
    rate,
    submit,
    print,
    append,
    setClass,
  };
}

// ---------------------------------------------------------------------------
//                       Live list population
// ---------------------------------------------------------------------------

/**
 * Fill the token / currency / institution dropdowns from the Paycrest
 * public list endpoints. Institutions depend on the selected currency, so
 * they refresh whenever the currency changes.
 */
async function populateLists(
  p: Panel,
  reads: Paycrest,
  log?: Log
): Promise<void> {
  try {
    const [tokens, currencies] = await Promise.all([
      reads.listTokens("starknet"),
      reads.listCurrencies(),
    ]);

    p.tokensBySymbol.clear();
    for (const t of tokens) p.tokensBySymbol.set(t.symbol, t);
    setOptions(
      p.token,
      tokens.map((t) => [t.symbol, t.symbol]),
      envVal("VITE_PAYCREST_TOKEN")?.toUpperCase()
    );

    setOptions(
      p.currency,
      currencies.map((c) => [c.code, `${c.code} — ${c.name}`]),
      envVal("VITE_PAYCREST_CURRENCY")
    );

    // Institutions for the currently-selected currency, refreshed on change.
    await refreshInstitutions(p, reads, log);
    p.currency.addEventListener("change", () => {
      void refreshInstitutions(p, reads, log);
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log?.(`Paycrest: failed to load lists: ${msg}`, "error");
    p.print(`Failed to load Paycrest tokens/currencies: ${msg}`, "err");
  }
}

async function refreshInstitutions(
  p: Panel,
  reads: Paycrest,
  log?: Log
): Promise<void> {
  const currency = p.currency.value;
  if (!currency) return;
  setOptions(p.institution, [["", "Loading…"]]);
  try {
    const institutions = await reads.listInstitutions(currency);
    setOptions(
      p.institution,
      institutions.map((i) => [i.code, `${i.name} (${i.type})`]),
      envVal("VITE_PAYCREST_RECIPIENT_INSTITUTION")
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log?.(`Paycrest: failed to load institutions: ${msg}`, "error");
    setOptions(p.institution, [["", `(failed to load: ${msg})`]]);
  }
}

/**
 * Fetch and display the Paycrest rate for the current inputs. Off-ramp
 * shows the "sell" rate against the stablecoin amount; on-ramp shows the
 * "buy" rate against the fiat amount. The quote is an estimate (the actual
 * rate is locked at order time).
 */
async function updateRate(p: Panel, reads: Paycrest, log?: Log): Promise<void> {
  const onramp = p.direction.value === "onramp";
  const token = p.token.value;
  const fiat = p.currency.value;
  const amountStr = (onramp ? p.fiatAmount.value : p.amount.value).trim();
  const amount = Number(amountStr);

  if (
    !token ||
    !fiat ||
    !amountStr ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    p.rate.textContent = "";
    return;
  }

  p.rate.textContent = "Fetching rate…";
  try {
    const side = onramp ? "buy" : "sell";
    // `amount` is what you provide: the token amount when selling
    // (off-ramp) and the fiat amount when buying (on-ramp). Passing a tiny
    // sentinel like 1 here returns "no provider available", so we send the
    // real entered amount in both cases.
    const res = await reads.getRate({
      network: "starknet",
      token,
      amount,
      fiat,
      side,
    });
    const rateStr = (onramp ? (res.buy ?? res.sell) : (res.sell ?? res.buy))
      ?.rate;
    const rate = rateStr ? Number(rateStr) : NaN;
    if (!Number.isFinite(rate) || rate <= 0) {
      p.rate.textContent = "Rate unavailable for this pair/amount.";
      return;
    }
    if (onramp) {
      const out = amount / rate;
      p.rate.textContent = `Rate: 1 ${token} ≈ ${rateStr} ${fiat} · you receive ≈ ${out.toFixed(4)} ${token}`;
    } else {
      const out = amount * rate;
      p.rate.textContent = `Rate: 1 ${token} ≈ ${rateStr} ${fiat} · you receive ≈ ${out.toFixed(2)} ${fiat}`;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log?.(`Paycrest rate error: ${msg}`, "error");
    p.rate.textContent = "Rate unavailable.";
  }
}

// Trailing debounce: collapse a burst of calls into one after `ms` idle.
function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Omit<Partial<HTMLElementTagNameMap[K]>, "style"> & { style?: string }
): HTMLElementTagNameMap[K] {
  const { style, ...rest } = props;
  const node = document.createElement(tag);
  Object.assign(node, rest);
  if (style) node.setAttribute("style", style);
  return node;
}

// Wrap a control in the app's `.form-group` + `<label>` (both globally styled).
function field(label: string, control: HTMLElement): HTMLElement {
  const wrap = el("div", { className: "form-group" });
  wrap.appendChild(el("label", { textContent: label }));
  wrap.appendChild(control);
  return wrap;
}

// Native input/select inherit the app's global `input, select` styles.
function input(
  id: string,
  opts: { value?: string; placeholder?: string }
): HTMLInputElement {
  return el("input", {
    id: `paycrest-${id}`,
    ...(opts.value !== undefined ? { value: opts.value } : {}),
    ...(opts.placeholder !== undefined
      ? { placeholder: opts.placeholder }
      : {}),
  });
}

function select(
  id: string,
  options: [string, string][],
  defaultValue?: string
): HTMLSelectElement {
  const sel = el("select", { id: `paycrest-${id}` });
  for (const [value, text] of options) {
    sel.appendChild(el("option", { value, textContent: text }));
  }
  if (defaultValue && options.some(([v]) => v === defaultValue)) {
    sel.value = defaultValue;
  }
  return sel;
}

// Replace a select's options in place, optionally pre-selecting a value.
function setOptions(
  sel: HTMLSelectElement,
  options: [string, string][],
  defaultValue?: string
): void {
  sel.replaceChildren();
  for (const [value, text] of options) {
    sel.appendChild(el("option", { value, textContent: text }));
  }
  if (defaultValue && options.some(([v]) => v === defaultValue)) {
    sel.value = defaultValue;
  }
}

// Trimmed env value, or undefined when unset/blank.
function envVal(key: string): string | undefined {
  const env = import.meta.env as Record<string, string | undefined>;
  const v = env[key]?.trim();
  return v && v.length > 0 ? v : undefined;
}

// `{ value }` when the env var is set, otherwise `{}` — spread into an
// input's options so a defined env var prefills the field.
function envValue(key: string): { value: string } | Record<string, never> {
  const v = envVal(key);
  return v ? { value: v } : {};
}
