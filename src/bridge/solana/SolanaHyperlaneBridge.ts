import type { BridgeInterface } from "@/bridge/types/BridgeInterface";
import type { InitiateBridgeWithdrawOptions } from "@/bridge/types/BridgeInterface";
import {
  type Address,
  Amount,
  type ExternalTransactionResponse,
  type SolanaAddress,
  type SolanaBridgeToken,
} from "@/types";
import { FeeErrorCause } from "@/types/errors";
import type {
  SolanaDepositFeeEstimation,
  SolanaWithdrawFeeEstimation,
  SolanaWalletConfig,
} from "@/bridge/solana/types";
import type { WalletInterface } from "@/wallet";
import type { Tx } from "@/tx";
import type {
  MultiProtocolProvider,
  SolanaWeb3Transaction,
  StarknetJsTransaction,
  Token as HyperlaneToken,
  TokenAmount,
  WarpCore,
} from "@hyperlane-xyz/sdk";
import {
  bridgeTokenToHyperlaneToken,
  hyperlaneChainName,
  setupMultiProtocolProvider,
} from "@/bridge/solana/registry";
import {
  loadHyperlane,
  type HyperlaneRuntime,
} from "@/bridge/solana/hyperlaneRuntime";
import type { Call } from "starknet";

// https://github.com/hyperlane-xyz/hyperlane-warp-ui-template/blob/21ac2754c69f69d056a39bcc664531d6118fee0c/src/consts/chains.ts#L68
const SOLANA_RENT_ESTIMATE = BigInt(Math.round(0.00411336 * 1e9));

export class SolanaHyperlaneBridge implements BridgeInterface<SolanaAddress> {
  private constructor(
    private readonly bridgeToken: SolanaBridgeToken,
    private readonly config: SolanaWalletConfig,
    readonly starknetWallet: WalletInterface,
    private readonly hyperlane: HyperlaneRuntime,
    private readonly multiProvider: MultiProtocolProvider,
    private readonly warpCore: WarpCore,
    private readonly solanaToken: HyperlaneToken,
    private readonly starknetToken: HyperlaneToken,
    private readonly starknetChain: string,
    private readonly solanaChain: string
  ) {}

  public static async create(
    bridgeToken: SolanaBridgeToken,
    config: SolanaWalletConfig,
    starknetWallet: WalletInterface
  ): Promise<SolanaHyperlaneBridge> {
    const hyperlane = await loadHyperlane("Solana bridge operations");
    const chainId = starknetWallet.getChainId();
    const multiProvider = setupMultiProtocolProvider(
      config,
      chainId,
      starknetWallet.getProvider(),
      hyperlane
    );

    const solanaToken = bridgeTokenToHyperlaneToken(
      bridgeToken,
      chainId,
      "solana",
      hyperlane
    );
    const starknetToken = bridgeTokenToHyperlaneToken(
      bridgeToken,
      chainId,
      "starknet",
      hyperlane
    );

    const WarpCoreCtor = hyperlane.sdk.WarpCore;
    const warpCore = new WarpCoreCtor(multiProvider, [
      solanaToken,
      starknetToken,
    ]) as WarpCore;

    return new SolanaHyperlaneBridge(
      bridgeToken,
      config,
      starknetWallet,
      hyperlane,
      multiProvider,
      warpCore,
      solanaToken,
      starknetToken,
      hyperlaneChainName(chainId, "starknet"),
      hyperlaneChainName(chainId, "solana")
    );
  }

  async deposit(
    recipient: Address,
    amount: Amount
  ): Promise<ExternalTransactionResponse> {
    const TokenAmountCtor = this.hyperlane.sdk.TokenAmount;
    const transactions = (await this.warpCore.getTransferRemoteTxs({
      destination: this.starknetChain,
      originTokenAmount: new TokenAmountCtor(
        amount.toBase(),
        this.solanaToken
      ) as TokenAmount,
      sender: this.config.address,
      recipient,
    })) as SolanaWeb3Transaction[];

    if (transactions.length === 0) {
      throw new Error("Hyperlane returned no deposit transactions.");
    }

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

  /**
   * Initiate a withdrawal from Starknet to Solana via Hyperlane.
   *
   * This is a single-step operation: the Starknet transaction triggers
   * Hyperlane message delivery to Solana automatically. No `completeWithdraw`
   * call is needed.
   */
  async initiateWithdraw(
    recipient: SolanaAddress,
    amount: Amount,
    options?: InitiateBridgeWithdrawOptions
  ): Promise<Tx> {
    const TokenAmountCtor = this.hyperlane.sdk.TokenAmount;
    const transactions = (await this.warpCore.getTransferRemoteTxs({
      destination: this.solanaChain,
      originTokenAmount: new TokenAmountCtor(
        amount.toBase(),
        this.starknetToken
      ) as TokenAmount,
      sender: this.starknetWallet.address.toString(),
      recipient: recipient.toString(),
    })) as StarknetJsTransaction[];

    if (transactions.length === 0) {
      throw new Error("Hyperlane returned no withdrawal transactions.");
    }

    const calls = transactions.map((tx) => tx.transaction as unknown as Call);
    return this.starknetWallet.execute(calls, options);
  }

  async getInitiateWithdrawFeeEstimate(
    _options?: InitiateBridgeWithdrawOptions
  ): Promise<SolanaWithdrawFeeEstimation> {
    const interchainResult = await this.estimateWithdrawInterchainFee();
    const localResult = await this.estimateWithdrawLocalFee(
      interchainResult.interchainFee
    );

    const estimate: SolanaWithdrawFeeEstimation = {
      localFee: this.strkAmount(localResult.localFee.amount),
      interchainFee: this.strkAmount(interchainResult.interchainFee.amount),
    };

    if (localResult.localFeeError) {
      estimate.localFeeError = localResult.localFeeError;
    }
    if (interchainResult.interchainFeeError) {
      estimate.interchainFeeError = interchainResult.interchainFeeError;
    }

    return estimate;
  }

  async getAvailableWithdrawBalance(account: Address): Promise<Amount> {
    const balance = await this.starknetToken.getBalance(
      this.multiProvider,
      account.toString()
    );
    const raw = balance?.amount ?? 0n;
    return Amount.fromRaw(
      raw,
      this.bridgeToken.decimals,
      this.bridgeToken.symbol
    );
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

      return { interchainFee: quote.plus(SOLANA_RENT_ESTIMATE) as TokenAmount };
    } catch {
      const HyperlaneTokenCtor = this.hyperlane.sdk.Token;
      const TokenAmountCtor = this.hyperlane.sdk.TokenAmount;
      const TokenStandard = this.hyperlane.sdk.TokenStandard;
      const zeroToken = new HyperlaneTokenCtor({
        symbol: "SOL",
        name: "Solana",
        decimals: 9,
        chainName: this.solanaChain,
        addressOrDenom: "native",
        standard: TokenStandard.SealevelHypNative,
      }) as HyperlaneToken;

      return {
        interchainFee: new TokenAmountCtor(0n, zeroToken) as TokenAmount,
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

      const TokenAmountCtor = this.hyperlane.sdk.TokenAmount;
      return {
        localFee: new TokenAmountCtor(
          BigInt(fee),
          this.solanaToken
        ) as TokenAmount,
      };
    } catch {
      const TokenAmountCtor = this.hyperlane.sdk.TokenAmount;
      return {
        localFee: new TokenAmountCtor(0n, interchainFee.token) as TokenAmount,
        localFeeError: FeeErrorCause.GENERIC_L1_FEE_ERROR,
      };
    }
  }

  private async estimateWithdrawInterchainFee(): Promise<{
    interchainFee: TokenAmount;
    interchainFeeError?: FeeErrorCause;
  }> {
    try {
      const quote = await this.warpCore.getInterchainTransferFee({
        originToken: this.starknetToken,
        destination: this.solanaChain,
        sender: this.starknetWallet.address.toString(),
      });

      return { interchainFee: quote as TokenAmount };
    } catch {
      const HyperlaneTokenCtor = this.hyperlane.sdk.Token;
      const TokenAmountCtor = this.hyperlane.sdk.TokenAmount;
      const TokenStandard = this.hyperlane.sdk.TokenStandard;
      const zeroToken = new HyperlaneTokenCtor({
        symbol: "STRK",
        name: "Starknet",
        decimals: 18,
        chainName: this.starknetChain,
        addressOrDenom: "native",
        standard: TokenStandard.StarknetHypSynthetic,
      }) as HyperlaneToken;

      return {
        interchainFee: new TokenAmountCtor(0n, zeroToken) as TokenAmount,
        interchainFeeError: FeeErrorCause.GENERIC_L2_FEE_ERROR,
      };
    }
  }

  private async estimateWithdrawLocalFee(interchainFee: TokenAmount): Promise<{
    localFee: TokenAmount;
    localFeeError?: FeeErrorCause;
  }> {
    try {
      const { fee } = await this.warpCore.getLocalTransferFee({
        destination: this.solanaChain,
        originToken: this.starknetToken,
        sender: this.starknetWallet.address.toString(),
        interchainFee,
      });

      const TokenAmountCtor = this.hyperlane.sdk.TokenAmount;
      return {
        localFee: new TokenAmountCtor(
          BigInt(fee),
          this.starknetToken
        ) as TokenAmount,
      };
    } catch {
      const TokenAmountCtor = this.hyperlane.sdk.TokenAmount;
      return {
        localFee: new TokenAmountCtor(0n, interchainFee.token) as TokenAmount,
        localFeeError: FeeErrorCause.GENERIC_L2_FEE_ERROR,
      };
    }
  }

  private solAmount(amount: bigint): Amount {
    return Amount.fromRaw(amount, 9, "SOL");
  }

  private strkAmount(amount: bigint): Amount {
    return Amount.fromRaw(amount, 18, "STRK");
  }
}
