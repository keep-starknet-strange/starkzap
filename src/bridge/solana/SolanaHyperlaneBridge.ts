import type { BridgeInterface } from "@/bridge/types/BridgeInterface";
import { type ExternalTransactionResponse, type SolanaAddress } from "@/types";
import type {
  SolanaDepositFeeEstimation,
  SolanaWalletConfig,
} from "@/bridge/solana/types";
import type { BridgeDepositOptions } from "@/bridge/types/BridgeInterface";
import type {
  Address,
  Amount,
  SolanaBridgeToken,
  WalletInterface,
} from "starkzap";

export class SolanaHyperlaneBridge implements BridgeInterface<
  SolanaAddress,
  SolanaDepositFeeEstimation
> {
  constructor(
    protected readonly bridgeToken: SolanaBridgeToken,
    protected readonly config: SolanaWalletConfig,
    readonly starknetWallet: WalletInterface
  ) {}

  deposit(
    recipient: Address,
    amount: Amount,
    options?: BridgeDepositOptions
  ): Promise<ExternalTransactionResponse> {
    console.log(recipient, amount, options);
    return Promise.reject();
  }

  getAllowance(): Promise<Amount | null> {
    return Promise.resolve(null);
  }

  getAvailableDepositBalance(account: SolanaAddress): Promise<Amount> {
    console.log(account);
    return Promise.reject();
  }

  getDepositFeeEstimate(
    options?: BridgeDepositOptions
  ): Promise<SolanaDepositFeeEstimation> {
    console.log(options);
    return Promise.reject();
  }
}
