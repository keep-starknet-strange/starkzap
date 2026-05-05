import type {
  EthereumInitiateWithdrawFeeEstimation,
  EthereumCompleteWithdrawFeeEstimation,
} from "@/bridge/ethereum";
import type {
  SolanaLayerSwapInitiateWithdrawFeeEstimation,
  SolanaWithdrawFeeEstimation,
} from "@/bridge/solana/types";

export type BridgeInitiateWithdrawFeeEstimation =
  | EthereumInitiateWithdrawFeeEstimation
  | SolanaWithdrawFeeEstimation
  | SolanaLayerSwapInitiateWithdrawFeeEstimation;

export type BridgeCompleteWithdrawFeeEstimation =
  EthereumCompleteWithdrawFeeEstimation;
