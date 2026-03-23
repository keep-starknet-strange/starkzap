import type {
  EthereumInitiateWithdrawFeeEstimation,
  EthereumCompleteWithdrawFeeEstimation,
} from "@/bridge/ethereum";
import type { SolanaWithdrawFeeEstimation } from "@/bridge/solana/types";

export type BridgeInitiateWithdrawFeeEstimation =
  | EthereumInitiateWithdrawFeeEstimation
  | SolanaWithdrawFeeEstimation;

export type BridgeCompleteWithdrawFeeEstimation =
  EthereumCompleteWithdrawFeeEstimation;
