import type {
  BridgeDepositOptions,
  BridgeInterface,
  InitiateBridgeWithdrawOptions,
} from "@/bridge/types/BridgeInterface";
import { LayerSwapApi } from "@/bridge/ethereum/layerswap/LayerSwapApi";
import type {
  LayerSwapApiConfig,
  LsDepositAction,
} from "@/bridge/ethereum/layerswap/types";
import type {
  SolanaLayerSwapDepositFeeEstimation,
  SolanaLayerSwapInitiateWithdrawFeeEstimation,
  SolanaWalletConfig,
} from "@/bridge/solana/types";
import {
  type Address,
  Amount,
  type ExternalTransactionResponse,
  fromAddress,
  type SolanaAddress,
  type SolanaBridgeToken,
} from "@/types";
import { FeeErrorCause } from "@/types/errors";
import type { WalletInterface } from "@/wallet";
import { loadSolanaWeb3 } from "@/connect/solanaWeb3Runtime";
import { Erc20 } from "@/erc20";
import type { Tx } from "@/tx";
import { type Call, CallData, uint256 } from "starknet";
import type { StarkZapLogger } from "@/logger";

// Solana charges 5000 lamports per signature, unchanged since v1.0.
// LayerSwap deposits are single-signature transfers with no user-side ATA
// creation (source-token ATA already exists), so this is the exact base fee.
// Priority fees embedded by LayerSwap in call_data are not captured.
const SOLANA_DEPOSIT_BASE_FEE_LAMPORTS = 5_000n;

// StarkGate's bridge token registry uses the System Program ID as the
// `address` marker for native SOL (there is no SPL mint for SOL).
const NATIVE_SOL_MARKER = "11111111111111111111111111111111";

// Dummy Starknet recipient used for withdraw fee estimation before a real
// swap exists — we only need it to satisfy the `transfer` calldata shape so
// `estimateFee` returns a gas estimate.
const DUMMY_SN_RECIPIENT = fromAddress(
  "0x023123100123103023123acb1231231231231031231ca123f23123123123100a"
);

/**
 * LayerSwap bridge provider for Solana → Starknet deposits.
 *
 * The deposit flow:
 * 1. Creates a swap on LayerSwap API
 * 2. Retrieves deposit actions (Solana transactions to execute)
 * 3. Builds and signs SOL/SPL transfers via the connected wallet
 * 4. Notifies LayerSwap for faster detection
 *
 * Routed by {@link BridgeOperator} when `token.protocol === Protocol.LAYERSWAP`
 * and `token.chain === ExternalChain.SOLANA`.
 */
export class SolanaLayerSwapBridge implements BridgeInterface<SolanaAddress> {
  private readonly api: LayerSwapApi;
  private readonly starknetToken: Erc20;
  private readonly sourceNetwork: string;
  private readonly destNetwork: string;

  constructor(
    private readonly bridgeToken: SolanaBridgeToken,
    private readonly config: SolanaWalletConfig,
    readonly starknetWallet: WalletInterface,
    apiKey: string,
    private readonly logger: StarkZapLogger,
    apiConfig?: Omit<LayerSwapApiConfig, "apiKey">
  ) {
    this.api = new LayerSwapApi({ apiKey, ...apiConfig });
    this.starknetToken = new Erc20(
      bridgeToken.intoStarknetToken(),
      starknetWallet.getProvider()
    );
    const mainnet = starknetWallet.getChainId().isMainnet();
    this.sourceNetwork = mainnet ? "SOLANA_MAINNET" : "SOLANA_DEVNET";
    this.destNetwork = mainnet ? "STARKNET_MAINNET" : "STARKNET_SEPOLIA";
  }

  async deposit(
    recipient: Address,
    amount: Amount,
    _options?: BridgeDepositOptions
  ): Promise<ExternalTransactionResponse> {
    const response = await this.api.createSwap({
      sourceNetwork: this.sourceNetwork,
      sourceToken: this.bridgeToken.symbol,
      destinationNetwork: this.destNetwork,
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
      (a) => a.network.name === this.sourceNetwork && a.type === "transfer"
    );

    if (!action) {
      throw new Error(
        `No transfer deposit action for swap "${swap.id}" on network "${this.sourceNetwork}".`
      );
    }

    const signature = await this.executeSolanaDepositAction(action);

    try {
      await this.api.speedUpDeposit(swap.id, signature);
    } catch {
      // Non-critical — LayerSwap will detect the deposit on its own.
    }

    return { hash: signature };
  }

  async getDepositFeeEstimate(
    _options?: BridgeDepositOptions
  ): Promise<SolanaLayerSwapDepositFeeEstimation> {
    const quote = await this.api
      .getQuote({
        sourceNetwork: this.sourceNetwork,
        sourceToken: this.bridgeToken.symbol,
        destinationNetwork: this.destNetwork,
        destinationToken: this.bridgeToken.symbol,
        // LayerSwap treats `0` as "quote at the route minimum". Pass the
        // user's amount here once `BridgeInterface.getDepositFeeEstimate`
        // grows an `amount` arg, for an exact quote.
        amount: "0",
      })
      .catch(() => null);

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
    const solanaWeb3 = await loadSolanaWeb3("LayerSwap balance query");
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

    const rawAmount = value[0]!.account.data.parsed.info.tokenAmount
      .amount as string;
    return Amount.fromRaw(BigInt(rawAmount), decimals, symbol);
  }

  async getAllowance(): Promise<Amount | null> {
    return null;
  }

  /**
   * Initiate a withdrawal from Starknet → Solana via LayerSwap.
   *
   * Creates a LayerSwap swap with source=Starknet, destination=Solana, and
   * executes the Starknet transfer into LayerSwap's deposit address.
   * LayerSwap auto-delivers the funds on Solana — no `completeWithdraw` step.
   */
  async initiateWithdraw(
    recipient: SolanaAddress,
    amount: Amount,
    options?: InitiateBridgeWithdrawOptions
  ): Promise<Tx> {
    const starknetAddress = this.starknetWallet.address.toString();

    const response = await this.api.createSwap({
      sourceNetwork: this.destNetwork,
      sourceToken: this.bridgeToken.symbol,
      destinationNetwork: this.sourceNetwork,
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
      (a) => a.network.name === this.destNetwork && a.type === "transfer"
    );

    if (!action) {
      throw new Error(
        `No transfer deposit action for swap "${swap.id}" on network "${this.destNetwork}".`
      );
    }

    const calls = this.buildStarknetTransferCalls(action);
    const tx = await this.starknetWallet.execute(calls, options);

    this.api.speedUpDeposit(swap.id, tx.hash).catch(() => {});

    return tx;
  }

  async getInitiateWithdrawFeeEstimate(
    _options?: InitiateBridgeWithdrawOptions
  ): Promise<SolanaLayerSwapInitiateWithdrawFeeEstimation> {
    const dummyCalls = this.buildDummyStarknetTransferCalls();

    const [quote, l2] = await Promise.all([
      this.api
        .getQuote({
          sourceNetwork: this.destNetwork,
          sourceToken: this.bridgeToken.symbol,
          destinationNetwork: this.sourceNetwork,
          destinationToken: this.bridgeToken.symbol,
          amount: "0",
        })
        .catch((e: unknown) => {
          this.logger.debug(
            "[SolanaLayerSwapBridge] getInitiateWithdrawFeeEstimate (quote) failed:",
            e
          );
          return null;
        }),
      this.estimateStarknetFee(dummyCalls),
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

  /**
   * Parse LayerSwap's Starknet deposit action into executable calls.
   *
   * LayerSwap ships the full Starknet call(s) as a JSON string in `call_data`.
   * Their reference UI does `account.execute(JSON.parse(callData))` — so the
   * parsed value is either a single `Call` or `Call[]`.
   */
  private buildStarknetTransferCalls(action: LsDepositAction): Call[] {
    if (!action.call_data) {
      throw new Error(
        `Starknet deposit action (order ${action.order}) has no call_data.`
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(action.call_data);
    } catch (e) {
      throw new Error(
        `Failed to parse LayerSwap Starknet call_data as JSON: ${
          (e as Error).message
        }`
      );
    }

    const calls = (Array.isArray(parsed) ? parsed : [parsed]) as Call[];
    if (calls.length === 0) {
      throw new Error(
        `LayerSwap returned no Starknet calls (order ${action.order}).`
      );
    }
    return calls;
  }

  private buildDummyStarknetTransferCalls(): Call[] {
    return [
      {
        contractAddress: this.bridgeToken.starknetAddress.toString(),
        entrypoint: "transfer",
        calldata: CallData.compile({
          recipient: DUMMY_SN_RECIPIENT.toString(),
          amount: uint256.bnToUint256(1n),
        }),
      },
    ];
  }

  private async estimateStarknetFee(
    calls: Call[]
  ): Promise<{ fee: Amount; error?: FeeErrorCause }> {
    try {
      const estimate = await this.starknetWallet.estimateFee(calls);
      const isFri = estimate.unit === "FRI";
      return {
        fee: Amount.fromRaw(estimate.overall_fee, 18, isFri ? "STRK" : "ETH"),
      };
    } catch (e) {
      this.logger.debug(
        "[SolanaLayerSwapBridge] estimateStarknetFee failed:",
        e
      );
      return {
        fee: Amount.fromRaw(0n, 18, "STRK"),
        error: FeeErrorCause.GENERIC_L2_FEE_ERROR,
      };
    }
  }

  private async executeSolanaDepositAction(
    action: LsDepositAction
  ): Promise<string> {
    if (!action.to_address) {
      throw new Error(
        `Deposit action (order ${action.order}) has no to_address.`
      );
    }

    const solanaWeb3 = await loadSolanaWeb3("LayerSwap deposit");
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
