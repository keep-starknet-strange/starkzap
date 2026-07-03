import {
  TongoConfidential,
  fromAddress,
  type ConfidentialProvider,
} from "starkzap-native";
import type { RpcProvider } from "starknet";
import { NETWORKS } from "@/core/network";

export interface PrivacyToken {
  symbol: string;
  contractAddress: string;
  decimals: number;
}

// A privacy provider definition. Add a new entry (e.g. native "STRK20" when
// the SDK ships it) — the rest of the feature is provider-agnostic.
export interface PrivacyProviderDef {
  id: string;
  label: string;
  tokensForNetwork: (networkIndex: number) => PrivacyToken[];
  create: (params: {
    token: PrivacyToken;
    privateKey: string;
    provider: RpcProvider;
  }) => ConfidentialProvider;
}

// Tongo contract addresses per token — https://docs.tongo.cash/protocol/contracts.html
const TOKEN_DECIMALS: Record<string, number> = {
  STRK: 18,
  ETH: 18,
  DAI: 18,
  USDC: 6,
  "USDC.e": 6,
  USDT: 6,
  WBTC: 8,
};
const TONGO_SEPOLIA: Record<string, string> = {
  STRK: "0x408163bfcfc2d76f34b444cb55e09dace5905cf84c0884e4637c2c0f06ab6ed",
  ETH: "0x2cf0dc1d9e8c7731353dd15e6f2f22140120ef2d27116b982fa4fed87f6fef5",
  USDC: "0x2caae365e67921979a4e5c16dd70eaa5776cfc6a9592bcb903d91933aaf2552",
  WBTC: "0x02b9f62f9be99590ad2505e9e89ca746c8fb67bdb6a4be2a1b9a1d867af7339e",
};
const TONGO_MAINNET: Record<string, string> = {
  STRK: "0x3a542d7eb73b3e33a2c54e9827ec17a6365e289ec35ccc94dde97950d9db498",
  ETH: "0x276e11a5428f6de18a38b7abc1d60abc75ce20aa3a925e20a393fcec9104f89",
  WBTC: "0x6d82c8c467eac77f880a1d5a090e0e0094a557bf67d74b98ba1881200750e27",
  "USDC.e": "0x72098b84989a45cc00697431dfba300f1f5d144ae916e98287418af4e548d96",
  USDC: "0x026f79017c3c382148832c6ae50c22502e66f7a2f81ccbdb9e1377af31859d3a",
  USDT: "0x659c62ba8bc3ac92ace36ba190b350451d0c767aa973dd63b042b59cc065da0",
  DAI: "0x511741b1ad1777b4ad59fbff49d64b8eb188e2aeb4fc72438278a589d8a10d8",
};

function tongoTokens(networkIndex: number): PrivacyToken[] {
  const map = NETWORKS[networkIndex].chainId.isSepolia()
    ? TONGO_SEPOLIA
    : TONGO_MAINNET;
  return Object.entries(map).map(([symbol, contractAddress]) => ({
    symbol,
    contractAddress,
    decimals: TOKEN_DECIMALS[symbol] ?? 18,
  }));
}

export const PRIVACY_PROVIDERS: PrivacyProviderDef[] = [
  {
    id: "tongo",
    label: "Tongo",
    tokensForNetwork: tongoTokens,
    create: ({ token, privateKey, provider }) =>
      new TongoConfidential({
        privateKey,
        contractAddress: fromAddress(token.contractAddress),
        provider,
      }),
  },
  // Future: { id: "strk20", label: "STRK20", ... } once the SDK exposes it.
];
