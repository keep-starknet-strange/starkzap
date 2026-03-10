export const ETHEREUM_DOMAIN_ID = 0;
export const STARKNET_DOMAIN_ID = 25;

export const ETH_FAST_TRANSFER_FEE_BP = 1; // 0.01% - fallback value
export const STARKNET_FAST_TRANSFER_FEE_BP = 14; // 0.14% - fallback value

export const FAST_TRANSFER_FINALITY_THRESHOLD = 1000;
export const STANDARD_TRANSFER_FINALITY_THRESHOLD = 2000;

export const LIVE_DOMAIN = "https://iris-api.circle.com";
export const SANDBOX_DOMAIN = "https://iris-api-sandbox.circle.com";

export function getFinalityThreshold(fastTransfer?: boolean) {
  return fastTransfer
    ? FAST_TRANSFER_FINALITY_THRESHOLD
    : STANDARD_TRANSFER_FINALITY_THRESHOLD;
}
