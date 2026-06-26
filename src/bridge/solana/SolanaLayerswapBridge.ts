import type {
  BridgeDepositOptions,
  BridgeInterface,
  InitiateBridgeWithdrawOptions,
} from "@/bridge/types/BridgeInterface";
import { LayerswapApi } from "@/bridge/ethereum/layerswap/LayerswapApi";
import { resolveLayerswapRoute } from "@/bridge/ethereum/layerswap/networks";
import {
  ExternalChain,
  NATIVE_TOKEN_ADDRESS,
} from "@/types/bridge/external-chain";
import { normalizeLsTxHash } from "@/bridge/ethereum/layerswap/hashes";
import {
  buildDummyStarknetTransferCalls,
  estimateStarknetFee,
  parseLayerswapStarknetCalls,
} from "@/bridge/ethereum/layerswap/starknet";
import type {
  LayerswapApiConfig,
  LsDepositAction,
} from "@/bridge/ethereum/layerswap/types";
import type {
  SolanaLayerswapDepositFeeEstimation,
  SolanaLayerswapInitiateWithdrawFeeEstimation,
  SolanaWalletConfig,
} from "@/bridge/solana/types";
import {
  type Address,
  Amount,
  type ExternalTransactionResponse,
  type SolanaAddress,
  type SolanaBridgeToken,
} from "@/types";
import { FeeErrorCause } from "@/types/errors";
import type { WalletInterface } from "@/wallet";
import { loadSolanaWeb3 } from "@/connect/solanaWeb3Runtime";
import { Erc20 } from "@/erc20";
import type { Tx } from "@/tx";
import type { StarkZapLogger } from "@/logger";

// Solana charges 5000 lamports per signature, unchanged since v1.0.
// Layerswap deposits are single-signature transfers with no user-side ATA
// creation (source-token ATA already exists), so this is the exact base fee.
// Priority fees embedded by Layerswap in call_data are not captured.
const SOLANA_DEPOSIT_BASE_FEE_LAMPORTS = 5_000n;

// StarkGate's bridge token registry uses the System Program ID as the
// `address` marker for native SOL (there is no SPL mint for SOL).
const NATIVE_SOL_MARKER = NATIVE_TOKEN_ADDRESS[ExternalChain.SOLANA];

/**
 * Layerswap bridge provider for Solana → Starknet deposits.
 *
 * The deposit flow:
 * 1. Creates a swap on Layerswap API
 * 2. Retrieves deposit actions (Solana transactions to execute)
 * 3. Builds and signs SOL/SPL transfers via the connected wallet
 * 4. Notifies Layerswap for faster detection
 *
 * Routed by {@link BridgeOperator} when `token.protocol === Protocol.LAYERSWAP`
 * and `token.chain === ExternalChain.SOLANA`.
 */
export class SolanaLayerswapBridge implements BridgeInterface<SolanaAddress> {
  private readonly api: LayerswapApi;
  private readonly starknetToken: Erc20;
  private readonly solanaNetwork: string;
  private readonly starknetNetwork: string;

  constructor(
    private readonly bridgeToken: SolanaBridgeToken,
    private readonly config: SolanaWalletConfig,
    readonly starknetWallet: WalletInterface,
    apiKey: string,
    private readonly logger: StarkZapLogger,
    apiConfig?: Omit<LayerswapApiConfig, "apiKey">
  ) {
    this.api = new LayerswapApi({ apiKey, ...apiConfig });
    this.starknetToken = new Erc20(
      bridgeToken.intoStarknetToken(),
      starknetWallet.getProvider()
    );
    const env = starknetWallet.getChainId().isMainnet() ? "mainnet" : "testnet";
    const route = resolveLayerswapRoute(ExternalChain.SOLANA, env);
    this.solanaNetwork = route.externalNetwork;
    this.starknetNetwork = route.starknetNetwork;
  }

  async deposit(
    recipient: Address,
    amount: Amount,
    _options?: BridgeDepositOptions
  ): Promise<ExternalTransactionResponse> {
    const response = await this.api.createSwap({
      sourceNetwork: this.solanaNetwork,
      sourceToken: this.bridgeToken.symbol,
      destinationNetwork: this.starknetNetwork,
      destinationToken: this.bridgeToken.symbol,
      amount: amount.toUnit(),
      destinationAddress: recipient.toString(),
      sourceAddress: this.config.address,
      refundAddress: this.config.address,
    });

    const swap = response.swap;

    const actions =
      response.deposit_actions.length > 0
        ? response.deposit_actions
        : await this.api.getDepositActions(swap.id, this.config.address);
    const action = actions.find(
      (a) => a.network.name === this.solanaNetwork && a.type === "transfer"
    );

    if (!action) {
      throw new Error(
        `No transfer deposit action for swap "${swap.id}" on network "${this.solanaNetwork}".`
      );
    }

    const signature = await this.executeSolanaDepositAction(action);

    // Nudge Layerswap to detect the source-chain tx faster. Non-critical —
    // their poller picks it up regardless.
    this.api.speedUpDeposit(swap.id, signature).catch((e: unknown) => {
      this.logger.debug("[SolanaLayerswapBridge] speedUpDeposit failed:", e);
    });

    return { hash: signature };
  }

  async getDepositFeeEstimate(
    _options?: BridgeDepositOptions
  ): Promise<SolanaLayerswapDepositFeeEstimation> {
    const quote = await this.api
      .getQuote({
        sourceNetwork: this.solanaNetwork,
        sourceToken: this.bridgeToken.symbol,
        destinationNetwork: this.starknetNetwork,
        destinationToken: this.bridgeToken.symbol,
        // Layerswap treats `0` as "quote at the route minimum". Pass the
        // user's amount here once `BridgeInterface.getDepositFeeEstimate`
        // grows an `amount` arg, for an exact quote.
        amount: "0",
      })
      .catch((e: unknown) => {
        this.logger.debug(
          "[SolanaLayerswapBridge] getDepositFeeEstimate (quote) failed:",
          e
        );
        return null;
      });

    const decimals = this.bridgeToken.decimals;
    const symbol = this.bridgeToken.symbol;
    const localFee = Amount.fromRaw(SOLANA_DEPOSIT_BASE_FEE_LAMPORTS, 9, "SOL");
    const zeroBridgeToken = Amount.fromRaw(0n, decimals, symbol);

    if (!quote) {
      return {
        localFee,
        totalFee: zeroBridgeToken,
        blockchainFee: zeroBridgeToken,
        serviceFee: zeroBridgeToken,
        avgCompletionTime: "",
        quoteError: FeeErrorCause.GENERIC_L2_FEE_ERROR,
      };
    }

    return {
      localFee,
      totalFee: Amount.parse(String(quote.total_fee), decimals, symbol),
      blockchainFee: Amount.parse(
        String(quote.blockchain_fee),
        decimals,
        symbol
      ),
      serviceFee: Amount.parse(String(quote.service_fee), decimals, symbol),
      avgCompletionTime: quote.avg_completion_time,
    };
  }

  async getAvailableDepositBalance(account: SolanaAddress): Promise<Amount> {
    const solanaWeb3 = await loadSolanaWeb3("Layerswap balance query");
    const connection = this.config.connection as InstanceType<
      typeof solanaWeb3.Connection
    >;
    const publicKey = new solanaWeb3.PublicKey(account);
    const decimals = this.bridgeToken.decimals;
    const symbol = this.bridgeToken.symbol;

    if (this.bridgeToken.address === NATIVE_SOL_MARKER) {
      const balance = await connection.getBalance(publicKey);
      return Amount.fromRaw(BigInt(balance), decimals, symbol);
    }

    const tokenMint = new solanaWeb3.PublicKey(this.bridgeToken.address);
    const { value } = await connection.getParsedTokenAccountsByOwner(
      publicKey,
      { mint: tokenMint }
    );

    if (value.length === 0) {
      return Amount.fromRaw(0n, decimals, symbol);
    }

    const rawAmount = value.reduce((sum, accountInfo) => {
      const amount = accountInfo.account.data.parsed.info.tokenAmount
        .amount as string;
      return sum + BigInt(amount);
    }, 0n);
    return Amount.fromRaw(rawAmount, decimals, symbol);
  }

  async getAllowance(): Promise<Amount | null> {
    return null;
  }

  /**
   * Initiate a withdrawal from Starknet → Solana via Layerswap.
   *
   * Creates a Layerswap swap with source=Starknet, destination=Solana, and
   * executes the Starknet transfer into Layerswap's deposit address.
   * Layerswap auto-delivers the funds on Solana — no `completeWithdraw` step.
   */
  async initiateWithdraw(
    recipient: SolanaAddress,
    amount: Amount,
    options?: InitiateBridgeWithdrawOptions
  ): Promise<Tx> {
    const starknetAddress = this.starknetWallet.address.toString();

    const response = await this.api.createSwap({
      sourceNetwork: this.starknetNetwork,
      sourceToken: this.bridgeToken.symbol,
      destinationNetwork: this.solanaNetwork,
      destinationToken: this.bridgeToken.symbol,
      amount: amount.toUnit(),
      destinationAddress: recipient.toString(),
      sourceAddress: starknetAddress,
      refundAddress: starknetAddress,
    });

    const swap = response.swap;
    const actions =
      response.deposit_actions.length > 0
        ? response.deposit_actions
        : await this.api.getDepositActions(swap.id, starknetAddress);
    const action = actions.find(
      (a) => a.network.name === this.starknetNetwork && a.type === "transfer"
    );

    if (!action) {
      throw new Error(
        `No transfer deposit action for swap "${swap.id}" on network "${this.starknetNetwork}".`
      );
    }

    const calls = parseLayerswapStarknetCalls(
      action,
      this.bridgeToken.starknetAddress.toString()
    );
    const tx = await this.starknetWallet.execute(calls, options);

    this.api
      .speedUpDeposit(swap.id, normalizeLsTxHash(tx.hash, "starknet"))
      .catch((e: unknown) => {
        this.logger.debug("[SolanaLayerswapBridge] speedUpDeposit failed:", e);
      });

    return tx;
  }

  async getInitiateWithdrawFeeEstimate(
    _options?: InitiateBridgeWithdrawOptions
  ): Promise<SolanaLayerswapInitiateWithdrawFeeEstimation> {
    const dummyCalls = buildDummyStarknetTransferCalls(
      this.bridgeToken.starknetAddress.toString()
    );

    const [quote, l2] = await Promise.all([
      this.api
        .getQuote({
          sourceNetwork: this.starknetNetwork,
          sourceToken: this.bridgeToken.symbol,
          destinationNetwork: this.solanaNetwork,
          destinationToken: this.bridgeToken.symbol,
          amount: "0",
        })
        .catch((e: unknown) => {
          this.logger.debug(
            "[SolanaLayerswapBridge] getInitiateWithdrawFeeEstimate (quote) failed:",
            e
          );
          return null;
        }),
      estimateStarknetFee(
        this.starknetWallet,
        dummyCalls,
        this.logger,
        "SolanaLayerswapBridge"
      ),
    ]);

    const decimals = this.bridgeToken.decimals;
    const symbol = this.bridgeToken.symbol;
    const zeroBridgeToken = Amount.fromRaw(0n, decimals, symbol);

    return {
      l2Fee: l2.fee,
      ...(l2.error !== undefined && { l2FeeError: l2.error }),
      blockchainFee: quote
        ? Amount.parse(String(quote.blockchain_fee), decimals, symbol)
        : zeroBridgeToken,
      serviceFee: quote
        ? Amount.parse(String(quote.service_fee), decimals, symbol)
        : zeroBridgeToken,
      avgCompletionTime: quote?.avg_completion_time ?? "",
      ...(quote === null && {
        quoteError: FeeErrorCause.GENERIC_L2_FEE_ERROR,
      }),
    };
  }

  async getAvailableWithdrawBalance(account: Address): Promise<Amount> {
    return this.starknetToken.balanceOf(account);
  }

  // ============================================================
  // Private helpers
  // ============================================================

  private async executeSolanaDepositAction(
    action: LsDepositAction
  ): Promise<string> {
    if (!action.to_address) {
      throw new Error(
        `Deposit action (order ${action.order}) has no to_address.`
      );
    }

    const solanaWeb3 = await loadSolanaWeb3("Layerswap deposit");
    const connection = this.config.connection as InstanceType<
      typeof solanaWeb3.Connection
    >;
    const fromPubkey = new solanaWeb3.PublicKey(this.config.address);

    const transaction = action.call_data
      ? solanaWeb3.Transaction.from(Buffer.from(action.call_data, "base64"))
      : this.buildNativeTransfer(
          solanaWeb3,
          fromPubkey,
          new solanaWeb3.PublicKey(action.to_address),
          BigInt(action.amount_in_base_units)
        );

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    if (!transaction.feePayer) {
      transaction.feePayer = fromPubkey;
    }

    return await this.config.provider.signAndSendTransaction(transaction);
  }

  private buildNativeTransfer(
    solanaWeb3: Awaited<ReturnType<typeof loadSolanaWeb3>>,
    fromPubkey: InstanceType<
      Awaited<ReturnType<typeof loadSolanaWeb3>>["PublicKey"]
    >,
    toPubkey: InstanceType<
      Awaited<ReturnType<typeof loadSolanaWeb3>>["PublicKey"]
    >,
    lamports: bigint
  ): InstanceType<Awaited<ReturnType<typeof loadSolanaWeb3>>["Transaction"]> {
    const tx = new solanaWeb3.Transaction();
    tx.add(
      solanaWeb3.SystemProgram.transfer({ fromPubkey, toPubkey, lamports })
    );
    return tx;
  }
}
