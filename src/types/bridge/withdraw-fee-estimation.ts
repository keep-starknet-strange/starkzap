import type {
  EthereumInitiateWithdrawFeeEstimation,
  EthereumCompleteWithdrawFeeEstimation,
} from "@/bridge/ethereum";
import type {
  SolanaLayerswapInitiateWithdrawFeeEstimation,
  SolanaWithdrawFeeEstimation,
} from "@/bridge/solana/types";

export type BridgeInitiateWithdrawFeeEstimation =
  | EthereumInitiateWithdrawFeeEstimation
  | SolanaWithdrawFeeEstimation
  | SolanaLayerswapInitiateWithdrawFeeEstimation;

export type BridgeCompleteWithdrawFeeEstimation =
  EthereumCompleteWithdrawFeeEstimation;
