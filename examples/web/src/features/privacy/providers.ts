import {
  TongoConfidential,
  fromAddress,
  type ConfidentialProvider,
} from "starkzap";
import type { RpcProvider } from "starknet";
import { TONGO_CONTRACTS } from "~/lib/stores/config";

export interface PrivacyToken {
  symbol: string;
  contractAddress: string;
  decimals: number;
}

// A privacy provider definition. Add a new entry (e.g. native "STRK20" when the
// SDK ships it) — the rest of the feature is provider-agnostic.
export interface PrivacyProviderDef {
  id: string;
  label: string;
  tokens: () => PrivacyToken[];
  create: (params: {
    token: PrivacyToken;
    privateKey: string;
    provider: RpcProvider;
  }) => ConfidentialProvider;
}

const TOKEN_DECIMALS: Record<string, number> = {
  STRK: 18,
  ETH: 18,
  DAI: 18,
  USDC: 6,
  "USDC.e": 6,
  USDT: 6,
  WBTC: 8,
};

function tongoTokens(): PrivacyToken[] {
  return Object.entries(TONGO_CONTRACTS).map(([symbol, contractAddress]) => ({
    symbol,
    contractAddress,
    decimals: TOKEN_DECIMALS[symbol] ?? 18,
  }));
}

export const PRIVACY_PROVIDERS: PrivacyProviderDef[] = [
  {
    id: "tongo",
    label: "Tongo",
    tokens: tongoTokens,
    create: ({ token, privateKey, provider }) =>
      new TongoConfidential({
        privateKey,
        contractAddress: fromAddress(token.contractAddress),
        // The monorepo resolves two identical `starknet` copies (one nested
        // under @cartridge/controller); bridge the nominal mismatch.
        provider: provider as never,
      }),
  },
  // Future: { id: "strk20", label: "STRK20", ... } once the SDK exposes it.
];
