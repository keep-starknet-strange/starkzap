// Type definitions for Creator Module
export interface CreatorConfig {
  starknetAddress: string;
  displayName: string;
  description?: string;
  avatarUrl?: string;
  websiteUrl?: string;
  socialLinks?: {
    twitter?: string;
    discord?: string;
    telegram?: string;
    github?: string;
  };
}

export interface TipButtonConfig {
  tokens: string[];
  chains: ChainId[];
  suggestedAmounts: string[];
  theme?: 'light' | 'dark';
  buttonStyle?: 'rounded' | 'pill' | 'square';
  showAmountSelector?: boolean;
  showChainSelector?: boolean;
  showTokenSelector?: boolean;
}

export type ChainId = 'base' | 'arbitrum' | 'starknet' | 'ethereum' | 'polygon';

export interface TokenConfig {
  symbol: string;
  address: string;
  decimals: number;
  chain: ChainId;
  iconUrl?: string;
}

export interface ChainConfig {
  id: ChainId;
  name: string;
  rpcUrl: string;
  chainId: number;
  nativeCurrency: string;
  explorerUrl: string;
}

export interface TipState {
  selectedChain: ChainId;
  selectedToken: string;
  amount: string;
  recipientAddress: string;
  payerAddress?: string;
  isProcessing: boolean;
  isDone: boolean;
  transactionHash?: string;
  error?: string;
}

export interface SubscriptionConfig {
  interval: 'monthly' | 'yearly';
  amount: string;
  token: string;
  chains: ChainId[];
}

export interface CreatorProfile {
  address: string;
  displayName: string;
  description?: string;
  avatarUrl?: string;
  websiteUrl?: string;
  socialLinks: {
    twitter?: string;
    discord?: string;
    telegram?: string;
    github?: string;
  };
  totalTipsReceived: bigint;
  tipCount: number;
  supportedChains: ChainId[];
  createdAt: number;
}

export interface TipEvent {
  id: string;
  recipient: string;
  amount: string;
  token: string;
  chain: ChainId;
  sender: string;
  timestamp: number;
  transactionHash: string;
}

export interface TipButtonStyles {
  primaryColor: string;
  secondaryColor: string;
  bgColor: string;
  textColor: string;
  buttonRadius: string;
  fontSize: string;
}
