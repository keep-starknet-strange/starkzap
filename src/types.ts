export type FeeMode = 'sponsored' | 'user_pays';

export interface TransferOptions {
  feeMode?: FeeMode;
  fallbackTo?: FeeMode;
  onFallback?: (error: import('./errors').SponsorshipNotAvailableError) => void;
  [key: string]: unknown;
}

export interface TransferParams {
  token: string;
  recipients: unknown[];
  options?: TransferOptions;
}
