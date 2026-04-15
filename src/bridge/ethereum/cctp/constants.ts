import {
  type Address,
  ChainId,
  type EthereumAddress,
  fromAddress,
} from "@/types";

export const ETHEREUM_DOMAIN_ID = 0;
export const STARKNET_DOMAIN_ID = 25;

export const ETH_FAST_TRANSFER_FEE_BP = 1; // 0.01% - fallback value
export const STARKNET_FAST_TRANSFER_FEE_BP = 14; // 0.14% - fallback value

export const REATTESTATION_SAFETY_BLOCK_THRESHOLD = 50; // 50 blocks is approximately 10 minutes
// 40 attempts × 3 s = 2 min ceiling, matching Circle's ~1–2 min fast-transfer attestation time.
export const REATTESTATION_POLL_INTERVAL_MS = 3_000;
export const REATTESTATION_POLL_ATTEMPTS = 40;

const FAST_TRANSFER_FINALITY_THRESHOLD = 1000;
const STANDARD_TRANSFER_FINALITY_THRESHOLD = 2000;

export function getFinalityThreshold(fastTransfer?: boolean) {
  return fastTransfer
    ? FAST_TRANSFER_FINALITY_THRESHOLD
    : STANDARD_TRANSFER_FINALITY_THRESHOLD;
}

const LIVE_DOMAIN = "https://iris-api.circle.com";
const SANDBOX_DOMAIN = "https://iris-api-sandbox.circle.com";

export function getCircleApiBaseUrl(chainId: ChainId): string {
  return chainId.isMainnet() ? LIVE_DOMAIN : SANDBOX_DOMAIN;
}

// Circle CCTP v2 — L1 Message Transmitter contracts
const MAINNET_MESSAGE_TRANSMITTER =
  "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64" as EthereumAddress;
const SEPOLIA_MESSAGE_TRANSMITTER =
  "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275" as EthereumAddress;

export function getMessageTransmitter(chainId: ChainId): EthereumAddress {
  return chainId.isMainnet()
    ? MAINNET_MESSAGE_TRANSMITTER
    : SEPOLIA_MESSAGE_TRANSMITTER;
}

// Circle CCTP v2 — L2 Token Messenger Minter contracts
const MAINNET_L2_TOKEN_MESSENGER = fromAddress(
  "0x07d421b9ca8aa32df259965cda8acb93f7599f69209a41872ae84638b2a20f2a"
);
const SEPOLIA_L2_TOKEN_MESSENGER = fromAddress(
  "0x04bDdE1E09a4B09a2F95d893D94a967b7717eB85A3f6dEcA8c080Ee01fBc3370"
);

export function getTokenMessenger(chainId: ChainId): Address {
  if (chainId.isMainnet()) {
    return MAINNET_L2_TOKEN_MESSENGER;
  } else {
    return SEPOLIA_L2_TOKEN_MESSENGER;
  }
}

// Empty bytes32 — allows any caller to relay the message on L1
export const EMPTY_DESTINATION_CALLER =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

// Fallback L1 gas estimate for completeWithdraw when simulation fails
export const FALLBACK_COMPLETE_WITHDRAW_GAS = 169_035n;

/**
 * Thrown by {@link CCTPBridge.completeWithdraw} and
 * {@link CCTPBridge.getCompleteWithdrawFeeEstimate} when options are missing,
 * not `{ protocol: "cctp" }`, or lack the Circle attestation payload needed to
 * call L1 `receiveMessage` / simulate it.
 */
export const CCTP_COMPLETE_WITHDRAW_OPTIONS_ERROR_MESSAGE =
  "Wrong options provided. CCTP requires attestation and message from Circle.";
