import type { EthereumDepositFeeEstimation } from "@/bridge/ethereum";
import type {
  HyperlaneFeeEstimate,
  SolanaLayerswapDepositFeeEstimation,
} from "@/bridge/solana/types";

export type BridgeDepositFeeEstimation =
  | EthereumDepositFeeEstimation
  | HyperlaneFeeEstimate
  | SolanaLayerswapDepositFeeEstimation;
