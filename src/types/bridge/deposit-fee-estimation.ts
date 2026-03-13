import type { EthereumDepositFeeEstimation } from "@/bridge/ethereum";
import type { SolanaDepositFeeEstimation } from "@/bridge/solana/types";

export type BridgeDepositFeeEstimation =
  | EthereumDepositFeeEstimation
  | SolanaDepositFeeEstimation;
