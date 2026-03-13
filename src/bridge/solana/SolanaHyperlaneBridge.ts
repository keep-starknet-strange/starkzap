import type { BridgeInterface } from "@/bridge/types/BridgeInterface";
import {
  Amount,
  type ExternalTransactionResponse,
  type SolanaAddress,
  type SolanaBridgeToken,
} from "@/types";
import { FeeErrorCause } from "@/types/errors";
import type {
  SolanaDepositFeeEstimation,
  SolanaWalletConfig,
} from "@/bridge/solana/types";
import type { WalletInterface } from "@/wallet";
import type { Address } from "starkzap";
import {
  MultiProtocolProvider,
  type SolanaWeb3Transaction,
  Token as HyperlaneToken,
  TokenAmount,
  TokenStandard,
  WarpCore,
} from "@hyperlane-xyz/sdk";
import {
  bridgeTokenToHyperlaneToken,
  hyperlaneChainName,
  setupMultiProtocolProvider,
} from "@/bridge/solana/registry";

// https://github.com/hyperlane-xyz/hyperlane-warp-ui-template/blob/21ac2754c69f69d056a39bcc664531d6118fee0c/src/consts/chains.ts#L68
const SOLANA_RENT_ESTIMATE = BigInt(Math.round(0.00411336 * 1e9));

export class SolanaHyperlaneBridge implements BridgeInterface<SolanaAddress> {
  private readonly multiProvider: MultiProtocolProvider;
  private readonly warpCore: WarpCore;
  private readonly solanaToken: HyperlaneToken;
  private readonly starknetChain: string;
  private readonly solanaChain: string;

  constructor(
    private readonly bridgeToken: SolanaBridgeToken,
    private readonly config: SolanaWalletConfig,
    readonly starknetWallet: WalletInterface
  ) {
    const chainId = starknetWallet.getChainId();
    this.multiProvider = setupMultiProtocolProvider(config, starknetWallet);

    this.solanaToken = bridgeTokenToHyperlaneToken(
      bridgeToken,
      chainId,
      "solana"
    );
    const starknetToken = bridgeTokenToHyperlaneToken(
      bridgeToken,
      chainId,
      "starknet"
    );
    this.warpCore = new WarpCore(this.multiProvider, [
      this.solanaToken,
      starknetToken,
    ]);

    this.starknetChain = hyperlaneChainName(chainId, "starknet");
    this.solanaChain = hyperlaneChainName(chainId, "solana");
  }

  async deposit(
    recipient: Address,
    amount: Amount
  ): Promise<ExternalTransactionResponse> {
    const transactions = (await this.warpCore.getTransferRemoteTxs({
      destination: this.starknetChain,
      originTokenAmount: new TokenAmount(amount.toBase(), this.solanaToken),
      sender: this.config.address,
      recipient,
    })) as SolanaWeb3Transaction[];

    let lastSignature = "";

    for (const tx of transactions) {
      lastSignature = await this.config.provider.signAndSendTransaction(
        tx.transaction
      );
    }

    return { hash: lastSignature };
  }

  async getDepositFeeEstimate(): Promise<SolanaDepositFeeEstimation> {
    const interchainResult = await this.estimateDepositInterchainFee();
    const localResult = await this.estimateDepositLocalFee(
      interchainResult.interchainFee
    );

    const estimate: SolanaDepositFeeEstimation = {
      localFee: this.solAmount(localResult.localFee.amount),
      interchainFee: this.solAmount(interchainResult.interchainFee.amount),
    };

    if (localResult.localFeeError) {
      estimate.localFeeError = localResult.localFeeError;
    }
    if (interchainResult.interchainFeeError) {
      estimate.interchainFeeError = interchainResult.interchainFeeError;
    }

    return estimate;
  }

  async getAvailableDepositBalance(account: SolanaAddress): Promise<Amount> {
    const balance = await this.solanaToken.getBalance(
      this.multiProvider,
      account
    );
    const raw = balance?.amount ?? 0n;

    return Amount.fromRaw(
      raw,
      this.bridgeToken.decimals,
      this.bridgeToken.symbol
    );
  }

  async getAllowance(): Promise<Amount | null> {
    return null;
  }

  private async estimateDepositInterchainFee(): Promise<{
    interchainFee: TokenAmount;
    interchainFeeError?: FeeErrorCause;
  }> {
    try {
      const quote = await this.warpCore.getInterchainTransferFee({
        destination: this.starknetChain,
        originToken: this.solanaToken,
        sender: this.config.address,
      });

      return { interchainFee: quote.plus(SOLANA_RENT_ESTIMATE) };
    } catch {
      const zeroToken = new HyperlaneToken({
        symbol: "SOL",
        name: "Solana",
        decimals: 9,
        chainName: this.solanaChain,
        addressOrDenom: "native",
        standard: TokenStandard.SealevelHypNative,
      });

      return {
        interchainFee: new TokenAmount(0n, zeroToken),
        interchainFeeError: FeeErrorCause.GENERIC_L1_FEE_ERROR,
      };
    }
  }

  private async estimateDepositLocalFee(interchainFee: TokenAmount): Promise<{
    localFee: TokenAmount;
    localFeeError?: FeeErrorCause;
  }> {
    try {
      const { fee } = await this.warpCore.getLocalTransferFee({
        destination: this.starknetChain,
        originToken: this.solanaToken,
        sender: this.config.address,
        interchainFee,
      });

      return {
        localFee: new TokenAmount(BigInt(fee), this.solanaToken),
      };
    } catch {
      return {
        localFee: new TokenAmount(0n, interchainFee.token),
        localFeeError: FeeErrorCause.GENERIC_L1_FEE_ERROR,
      };
    }
  }

  private solAmount(amount: bigint): Amount {
    return Amount.fromRaw(amount, 9, "SOL");
  }
}
