import { writable, derived, get } from "svelte/store";
import {
  getPresets,
  getTokensFromAddresses,
  fromAddress,
  type Token,
} from "starkzap";
import { CHAIN_ID } from "./config";
import { walletState } from "./wallet";

// Tokens shown across the app (balances, transfers, swap, dca). The list is the
// preset defaults plus any custom tokens the user imports, which are persisted
// in localStorage per chain so they survive reloads.
const PRESET_SYMBOLS = ["STRK", "ETH", "USDC", "USDT", "WBTC"];
const STORAGE_KEY = `starkzap:web:customTokens:${CHAIN_ID.toLiteral()}`;

function presetTokens(): Token[] {
  const presets = getPresets(CHAIN_ID);
  return PRESET_SYMBOLS.map((s) => presets[s]).filter((t): t is Token => !!t);
}

// localStorage-safe shape (Token.metadata.logoUrl is a URL instance).
interface StoredToken {
  name: string;
  address: string;
  symbol: string;
  decimals: number;
  logoUrl?: string;
}

function toStored(t: Token): StoredToken {
  return {
    name: t.name,
    address: t.address,
    symbol: t.symbol,
    decimals: t.decimals,
    ...(t.metadata?.logoUrl ? { logoUrl: t.metadata.logoUrl.href } : {}),
  };
}

function fromStored(s: StoredToken): Token {
  return {
    name: s.name,
    address: fromAddress(s.address),
    symbol: s.symbol,
    decimals: s.decimals,
    ...(s.logoUrl ? { metadata: { logoUrl: new URL(s.logoUrl) } } : {}),
  };
}

function loadCustom(): Token[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredToken[]).map(fromStored) : [];
  } catch {
    return [];
  }
}

function saveCustom(list: Token[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.map(toStored)));
  } catch {
    // ignore storage failures — the token still works for this session
  }
}

const presets = presetTokens();
const customTokens = writable<Token[]>(loadCustom());

// The full token list every consumer reads.
export const tokens = derived(customTokens, ($custom) => [
  ...presets,
  ...$custom,
]);

/**
 * Import an ERC20 by address: fetch its on-chain metadata, persist it, and add
 * it to the shared list. Requires a connected wallet (for the RPC provider).
 * Returns the imported token.
 */
export async function addToken(addressInput: string): Promise<Token> {
  const { wallet } = get(walletState);
  if (!wallet) throw new Error("Connect a wallet first.");

  const address = fromAddress(addressInput.trim());
  const existing = get(tokens).find((t) => t.address === address);
  if (existing) return existing;

  const [token] = await getTokensFromAddresses([address], wallet.getProvider());
  if (!token) throw new Error("No ERC20 token found at that address.");

  customTokens.update((list) => {
    const next = [...list, token];
    saveCustom(next);
    return next;
  });
  return token;
}

export function removeToken(address: string): void {
  customTokens.update((list) => {
    const next = list.filter((t) => t.address !== address);
    saveCustom(next);
    return next;
  });
}

// Whether a token is a user-imported custom one (vs a preset).
export function isCustom(address: string): boolean {
  return get(customTokens).some((t) => t.address === address);
}
