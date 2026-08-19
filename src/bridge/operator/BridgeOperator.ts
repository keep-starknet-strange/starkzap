import { BridgeCache } from "@/bridge/operator/BridgeCache";
import { BridgeMonitorCache } from "@/bridge/operator/BridgeMonitorCache";
import { BridgeToken, EthereumBridgeToken } from "@/types/bridge/bridge-token";
import type {
  BridgeDepositOptions,
  BridgeInterface,
  CompleteBridgeWithdrawOptions,
  InitiateBridgeWithdrawOptions,
} from "@/bridge/types/BridgeInterface";
import { Protocol } from "@/types/bridge/protocol";
import {
  ConnectedEthereumWallet,
  type ConnectedExternalWallet,
  ConnectedSolanaWallet,
  SolanaNetwork,
} from "@/connect";
import type { WalletInterface } from "@/wallet";
import type { BridgeOperatorInterface } from "@/bridge/operator/BridgeOperatorInterface";
import {
  type Address,
  type Amount,
  type BridgeCompleteWithdrawFeeEstimation,
  type BridgeDepositFeeEstimation,
  type BridgeInitiateWithdrawFeeEstimation,
  type BridgingConfig,
  ContractRoutedEthereumBridgeToken,
  ContractRoutedSolanaBridgeToken,
  type EthereumAddress,
  type ExternalAddress,
  ExternalChain,
  type ExternalTransactionResponse,
  type SolanaAddress,
  SolanaBridgeToken,
} from "@/types";
import { toEthWalletConfig } from "@/bridge/ethereum/ethers-interop";
import { loadEthers } from "@/connect/ethersRuntime";
import { loadSolanaWeb3 } from "@/connect/solanaWeb3Runtime";
import { loadHyperlane } from "@/bridge/solana/hyperlaneRuntime";
import type { Tx } from "@/tx";
import { AutoWithdrawFeesHandler } from "@/bridge/utils/auto-withdraw-fees-handler";
import type { Provider } from "ethers";
import { resolveFetch } from "@/utils";
import type { BridgeMonitorInterface } from "@/bridge/monitor/BridgeMonitorInterface";
import type {
  DepositMonitorResult,
  DepositState,
  DepositStateInput,
  WithdrawalState,
  WithdrawalStateInput,
  WithdrawMonitorResult,
} from "@/bridge/monitor/types";
import type { StarkZapLogger } from "@/logger";
import { CCTPFees } from "@/bridge/ethereum/cctp/CCTPFees";

/**
 * Narrow a bridge token to its contract-routed subclass, throwing a clear error
 * if it is not one. Canonical, Lords, OFT and Hyperlane bridges build a bridge
 * `Contract` from the token's on-chain addresses, so they require those fields
 * to be present. The repository only constructs `ContractRouted*` tokens for
 * those protocols (see `isContractRouted`), so this guard always passes in
 * practice — it replaces an unchecked `as` cast with an explicit invariant check
 * so any future drift surfaces as an actionable error instead of a
 * `new Contract(undefined, ...)` failure.
 */
function requireContractRouted<T extends BridgeToken>(
  token: BridgeToken,
  TokenClass: new (...args: never[]) => T
): T {
  if (token instanceof TokenClass) {
    return token;
  }
  throw new Error(
    `Bridging ${token.name} via "${token.protocol}" requires a contract-routed token with on-chain bridge addresses, but its token record carries none.`
  );
}

export class BridgeOperator implements BridgeOperatorInterface {
  private cache = new BridgeCache();
  private monitorCache = new BridgeMonitorCache();
  private _autoWithdrawFeesHandler: AutoWithdrawFeesHandler | undefined;
  private _cctpFees: CCTPFees | undefined = undefined;
  private _ethereumMonitorProvider: Promise<Provider> | undefined;

  constructor(
    private readonly starknetWallet: WalletInterface,
    private readonly bridgingConfig: BridgingConfig | undefined,
    private readonly logger: StarkZapLogger
  ) {}

  public async deposit(
    recipient: Address,
    amount: Amount,
    token: BridgeToken,
    externalWallet: ConnectedExternalWallet,
    options?: BridgeDepositOptions
  ): Promise<ExternalTransactionResponse> {
    const bridge = await this.bridge(
      token,
      externalWallet,
      this.starknetWallet
    );
    return bridge.deposit(recipient, amount, options);
  }

  public async getDepositBalance(
    token: BridgeToken,
    externalWallet: ConnectedExternalWallet
  ) {
    const bridge = await this.bridge(
      token,
      externalWallet,
      this.starknetWallet
    );
    return bridge.getAvailableDepositBalance(externalWallet.address);
  }

  async getDepositFeeEstimate(
    token: BridgeToken,
    externalWallet: ConnectedExternalWallet,
    options?: BridgeDepositOptions
  ): Promise<BridgeDepositFeeEstimation> {
    const bridge = await this.bridge(
      token,
      externalWallet,
      this.starknetWallet
    );
    return bridge.getDepositFeeEstimate(options);
  }

  public async getAllowance(
    token: BridgeToken,
    externalWallet: ConnectedExternalWallet
  ) {
    const bridge = await this.bridge(
      token,
      externalWallet,
      this.starknetWallet
    );
    return bridge.getAllowance();
  }

  public async initiateWithdraw(
    recipient: ExternalAddress,
    amount: Amount,
    token: BridgeToken,
    externalWallet: ConnectedExternalWallet,
    options?: InitiateBridgeWithdrawOptions
  ): Promise<Tx> {
    const bridge = await this.bridge(
      token,
      externalWallet,
      this.starknetWallet
    );
    if (!bridge.initiateWithdraw) {
      throw new Error(
        `Protocol "${token.protocol}" does not support withdrawal.`
      );
    }
    return bridge.initiateWithdraw(recipient, amount, options);
  }

  public async getWithdrawBalance(
    token: BridgeToken,
    externalWallet: ConnectedExternalWallet
  ): Promise<Amount> {
    const bridge = await this.bridge(
      token,
      externalWallet,
      this.starknetWallet
    );
    if (!bridge.getAvailableWithdrawBalance) {
      throw new Error(
        `Protocol "${token.protocol}" does not support withdrawal balance queries.`
      );
    }
    return bridge.getAvailableWithdrawBalance(this.starknetWallet.address);
  }

  public async getInitiateWithdrawFeeEstimate(
    token: BridgeToken,
    externalWallet: ConnectedExternalWallet,
    options?: InitiateBridgeWithdrawOptions
  ): Promise<BridgeInitiateWithdrawFeeEstimation> {
    const bridge = await this.bridge(
      token,
      externalWallet,
      this.starknetWallet
    );
    if (!bridge.getInitiateWithdrawFeeEstimate) {
      throw new Error(
        `Protocol "${token.protocol}" does not support withdrawal fee estimation.`
      );
    }
    return bridge.getInitiateWithdrawFeeEstimate(options);
  }

  public async completeWithdraw(
    recipient: ExternalAddress,
    amount: Amount,
    token: BridgeToken,
    externalWallet: ConnectedExternalWallet,
    options?: CompleteBridgeWithdrawOptions
  ): Promise<ExternalTransactionResponse> {
    const bridge = await this.bridge(
      token,
      externalWallet,
      this.starknetWallet
    );
    if (!bridge.completeWithdraw) {
      throw new Error(
        `Protocol "${token.protocol}" does not require a completion step.`
      );
    }
    return bridge.completeWithdraw(recipient, amount, options);
  }

  public async getCompleteWithdrawFeeEstimate(
    amount: Amount,
    recipient: ExternalAddress,
    token: BridgeToken,
    externalWallet: ConnectedExternalWallet,
    options?: CompleteBridgeWithdrawOptions
  ): Promise<BridgeCompleteWithdrawFeeEstimation> {
    const bridge = await this.bridge(
      token,
      externalWallet,
      this.starknetWallet
    );
    if (!bridge.getCompleteWithdrawFeeEstimate) {
      throw new Error(
        `Protocol "${token.protocol}" does not require a completion step.`
      );
    }
    return bridge.getCompleteWithdrawFeeEstimate(amount, recipient, options);
  }

  public async monitorDeposit(
    token: BridgeToken,
    externalTxHash: string,
    starknetTxHash?: string
  ): Promise<DepositMonitorResult> {
    const monitor = await this.monitor(token);
    return monitor.monitorDeposit(externalTxHash, starknetTxHash);
  }

  public async monitorWithdrawal(
    token: BridgeToken,
    snTxHash: string,
    externalTxHash?: string
  ): Promise<WithdrawMonitorResult> {
    const monitor = await this.monitor(token);
    return monitor.monitorWithdrawal(snTxHash, externalTxHash);
  }

  public async getDepositState(
    token: BridgeToken,
    param: DepositStateInput
  ): Promise<DepositState> {
    const monitor = await this.monitor(token);
    return monitor.getDepositState(param);
  }

  public async getWithdrawalState(
    token: BridgeToken,
    param: WithdrawalStateInput
  ): Promise<WithdrawalState> {
    const monitor = await this.monitor(token);
    return monitor.getWithdrawalState(param);
  }

  public dispose(): void {
    const providerPromise = this._ethereumMonitorProvider;
    this._ethereumMonitorProvider = undefined;
    if (providerPromise) {
      void providerPromise
        .then((provider) => {
          provider.destroy();
        })
        .catch(() => {
          // Creation failed or never resolved; nothing to destroy.
        });
    }
    this.monitorCache.clear();
    this._autoWithdrawFeesHandler = undefined;
    this.cache.clear();
  }

  private bridge(
    token: BridgeToken,
    wallet: ConnectedExternalWallet,
    starknetWallet: WalletInterface
  ): Promise<BridgeInterface> {
    const cached = this.cache.get(token, wallet);
    if (cached) return cached;

    const promise = this.createBridge(token, wallet, starknetWallet);
    this.cache.set(token, wallet, promise);
    return promise;
  }

  private async createBridge(
    token: BridgeToken,
    wallet: ConnectedExternalWallet,
    starknetWallet: WalletInterface
  ): Promise<BridgeInterface> {
    if (token.chain !== wallet.chain) {
      throw new Error(
        `Attempting to bridge ${token.name} on ${token.chain} but external connected wallet is on chain ${wallet.chain}. Connect to a ${token.chain} wallet`
      );
    }

    if (token.chain === ExternalChain.ETHEREUM) {
      return await this.createEthereumBridge(
        token as EthereumBridgeToken,
        wallet as ConnectedEthereumWallet,
        starknetWallet
      );
    } else if (token.chain === ExternalChain.SOLANA) {
      const externalWallet = wallet as ConnectedSolanaWallet;
      if (
        token.protocol === Protocol.LAYERSWAP &&
        starknetWallet.getChainId().isSepolia() &&
        externalWallet.network !== SolanaNetwork.DEVNET
      ) {
        throw new Error(
          `Attempting to bridge ${token.name} on sepolia using Layerswap protocol but wallet is not connected to Solana Devnet`
        );
      }

      if (
        token.protocol === Protocol.HYPERLANE &&
        starknetWallet.getChainId().isSepolia() &&
        externalWallet.network !== SolanaNetwork.TESTNET
      ) {
        throw new Error(
          `Attempting to bridge ${token.name} on sepolia using Hyperlane protocol but wallet is not connected to Solana Testnet`
        );
      }

      return await this.createSolanaBridge(
        token as SolanaBridgeToken,
        externalWallet,
        starknetWallet
      );
    }

    throw new Error(`Unsupported chain "${token.chain}".`);
  }

  /**
   * Reject a protocol whose static configuration is missing before any RPC call.
   *
   * The cases in {@link createEthereumBridge} read the key again through the
   * same helpers, so each message lives in one place and neither call touches
   * the network.
   */
  private assertProtocolConfigured(token: EthereumBridgeToken): void {
    if (token.id === "lords") return;

    switch (token.protocol) {
      case Protocol.OFT:
      case Protocol.OFT_MIGRATED:
        this.requireLayerZeroApiKey();
        return;
      case Protocol.LAYERSWAP:
        this.requireLayerswapApiKey();
        return;
      default:
        return;
    }
  }

  /** LayerZero API key, or an error naming the setting that supplies it. */
  private requireLayerZeroApiKey(): string {
    const apiKey = this.bridgingConfig?.layerZeroApiKey;
    if (!apiKey) {
      throw new Error(
        "OFT bridging requires a LayerZero API key. " +
          'Set "bridging.layerZeroApiKey" in the SDK configuration.'
      );
    }
    return apiKey;
  }

  /** Layerswap API key, or an error naming the setting that supplies it. */
  private requireLayerswapApiKey(): string {
    const apiKey = this.bridgingConfig?.layerswapApiKey;
    if (!apiKey) {
      throw new Error(
        "Layerswap bridging requires an API key. " +
          'Set "bridging.layerswapApiKey" in the SDK configuration.'
      );
    }
    return apiKey;
  }

  private async createEthereumBridge(
    token: EthereumBridgeToken,
    externalWallet: ConnectedEthereumWallet,
    starknetWallet: WalletInterface
  ): Promise<BridgeInterface<EthereumAddress>> {
    // Before the wallet config, which reads the wallet's chain id over RPC. A
    // missing API key is knowable without that round-trip, so it should not cost
    // one.
    this.assertProtocolConfigured(token);

    const walletConfig = await toEthWalletConfig(
      externalWallet,
      this.bridgingConfig?.ethereumRpcUrl
    );

    if (token.id === "lords") {
      const { LordsBridge } =
        await import("@/bridge/ethereum/lords/LordsBridge");
      return new LordsBridge(
        requireContractRouted(token, ContractRoutedEthereumBridgeToken),
        walletConfig,
        starknetWallet,
        this.autoWithdrawFeesHandler,
        this.logger
      );
    }

    switch (token.protocol) {
      case Protocol.CANONICAL: {
        const { CanonicalEthereumBridge } =
          await import("@/bridge/ethereum/canonical/CanonicalEthereumBridge");
        return new CanonicalEthereumBridge(
          requireContractRouted(token, ContractRoutedEthereumBridgeToken),
          walletConfig,
          starknetWallet,
          this.autoWithdrawFeesHandler,
          this.logger
        );
      }
      case Protocol.CCTP: {
        const { CCTPBridge } =
          await import("@/bridge/ethereum/cctp/CCTPBridge");
        if (!this._cctpFees) {
          this._cctpFees = new CCTPFees(this.logger);
        }

        return new CCTPBridge(
          token,
          walletConfig,
          starknetWallet,
          this.logger,
          this._cctpFees
        );
      }
      case Protocol.OFT:
      case Protocol.OFT_MIGRATED: {
        const apiKey = this.requireLayerZeroApiKey();
        const { OftBridge } = await import("@/bridge/ethereum/oft/OftBridge");
        return new OftBridge(
          requireContractRouted(token, ContractRoutedEthereumBridgeToken),
          walletConfig,
          starknetWallet,
          apiKey,
          this.logger
        );
      }
      case Protocol.LAYERSWAP: {
        const apiKey = this.requireLayerswapApiKey();
        const { LayerswapBridge } =
          await import("@/bridge/ethereum/layerswap/LayerswapBridge");
        const baseUrl = this.bridgingConfig?.layerswapBaseUrl;
        return new LayerswapBridge(
          token,
          walletConfig,
          starknetWallet,
          apiKey,
          this.logger,
          baseUrl ? { baseUrl } : undefined
        );
      }
      default:
        throw new Error(
          `Unsupported protocol "${token.protocol}" for ${token.chain} chain.`
        );
    }
  }

  private async createSolanaBridge(
    token: SolanaBridgeToken,
    externalWallet: ConnectedSolanaWallet,
    starknetWallet: WalletInterface
  ): Promise<BridgeInterface<SolanaAddress>> {
    // Protocol-specific bridges and @solana/web3.js are loaded lazily to avoid
    // pulling Node.js-only transitive dependencies into polyfill-requiring clients.
    const connection = await this.getSolanaConnection(token.protocol);

    const walletConfig = {
      address: externalWallet.address,
      provider: externalWallet.provider,
      connection,
    };

    switch (token.protocol) {
      case Protocol.HYPERLANE: {
        const { SolanaHyperlaneBridge } =
          await import("@/bridge/solana/SolanaHyperlaneBridge");
        return await SolanaHyperlaneBridge.create(
          requireContractRouted(token, ContractRoutedSolanaBridgeToken),
          walletConfig,
          starknetWallet
        );
      }
      case Protocol.LAYERSWAP: {
        const apiKey = this.bridgingConfig?.layerswapApiKey;
        if (!apiKey) {
          throw new Error(
            "Layerswap bridging requires an API key. " +
              'Set "bridging.layerswapApiKey" in the SDK configuration.'
          );
        }
        const { SolanaLayerswapBridge } =
          await import("@/bridge/solana/SolanaLayerswapBridge");
        const baseUrl = this.bridgingConfig?.layerswapBaseUrl;
        return new SolanaLayerswapBridge(
          token,
          walletConfig,
          starknetWallet,
          apiKey,
          this.logger,
          baseUrl ? { baseUrl } : undefined
        );
      }
      default:
        throw new Error(
          `Unsupported protocol "${token.protocol}" for ${token.chain} chain.`
        );
    }
  }

  private async monitor(token: BridgeToken): Promise<BridgeMonitorInterface> {
    if (token.protocol === Protocol.LAYERSWAP) {
      return this.getOrCreateMonitor(Protocol.LAYERSWAP, async () => {
        const apiKey = this.bridgingConfig?.layerswapApiKey;
        if (!apiKey) {
          throw new Error(
            "Layerswap bridge monitoring requires an API key. " +
              'Set "bridging.layerswapApiKey" in the SDK configuration.'
          );
        }
        const { LayerswapMonitor } =
          await import("@/bridge/monitor/layerswap/LayerswapMonitor");
        const baseUrl = this.bridgingConfig?.layerswapBaseUrl;
        return new LayerswapMonitor({
          apiKey,
          logger: this.logger,
          ...(baseUrl !== undefined && { baseUrl }),
        });
      });
    }

    if (
      token.chain === ExternalChain.SOLANA &&
      token.protocol === Protocol.HYPERLANE
    ) {
      return this.getOrCreateMonitor(Protocol.HYPERLANE, async () => {
        const [{ SolanaHyperlaneMonitor }, { connection, hyperlane }] =
          await Promise.all([
            import("@/bridge/monitor/hyperlane/SolanaHyperlaneMonitor"),
            Promise.all([
              this.getSolanaConnection(token.protocol),
              loadHyperlane("Solana bridge monitoring"),
            ]).then(([connection, hyperlane]) => ({ connection, hyperlane })),
          ]);
        return new SolanaHyperlaneMonitor({
          chainId: this.starknetWallet.getChainId(),
          starknetProvider: this.starknetWallet.getProvider(),
          solanaConnection: connection,
          hyperlane,
          logger: this.logger,
        });
      });
    }

    const ethToken = token as EthereumBridgeToken;
    const ethereumProvider = await this.getEthereumMonitorProvider();

    switch (ethToken.protocol) {
      case Protocol.CANONICAL:
        return this.getOrCreateMonitor(ethToken.protocol, async () => {
          const { CanonicalMonitor } =
            await import("@/bridge/monitor/canonical/CanonicalMonitor");
          return new CanonicalMonitor({
            chainId: this.starknetWallet.getChainId(),
            starknetProvider: this.starknetWallet.getProvider(),
            ethereumProvider,
            logger: this.logger,
          });
        });

      case Protocol.CCTP:
        return this.getOrCreateMonitor(ethToken.protocol, async () => {
          const { CctpMonitor } =
            await import("@/bridge/monitor/cctp/CctpMonitor");
          return new CctpMonitor({
            chainId: this.starknetWallet.getChainId(),
            starknetProvider: this.starknetWallet.getProvider(),
            ethereumProvider,
            fetchFn: resolveFetch(undefined),
            logger: this.logger,
          });
        });

      case Protocol.OFT:
      case Protocol.OFT_MIGRATED: {
        const oftProtocol = ethToken.protocol;
        return this.getOrCreateMonitor(oftProtocol, async () => {
          const { OftMonitor } =
            await import("@/bridge/monitor/oft/OftMonitor");
          return new OftMonitor({
            chainId: this.starknetWallet.getChainId(),
            starknetProvider: this.starknetWallet.getProvider(),
            ethereumProvider,
            protocol: oftProtocol,
            logger: this.logger,
          });
        });
      }

      default:
        throw new Error(
          `Unsupported protocol "${ethToken.protocol}" for bridge monitoring.`
        );
    }
  }

  private getOrCreateMonitor(
    protocol: Protocol,
    factory: () => Promise<BridgeMonitorInterface>
  ): Promise<BridgeMonitorInterface> {
    const cached = this.monitorCache.get(protocol);
    if (cached) {
      return cached;
    }

    const promise = factory();
    this.monitorCache.set(protocol, promise);
    return promise;
  }

  private getEthereumMonitorProvider(): Promise<Provider> {
    if (this._ethereumMonitorProvider) {
      return this._ethereumMonitorProvider;
    }

    const rpcUrl = this.bridgingConfig?.ethereumRpcUrl;
    if (!rpcUrl) {
      return Promise.reject(
        new Error(
          "Bridge monitoring requires an Ethereum RPC URL. " +
            'Set "bridging.ethereumRpcUrl" in the SDK configuration.'
        )
      );
    }

    const created = (async (): Promise<Provider> => {
      const { JsonRpcProvider } = await loadEthers("Bridge monitoring");
      return new JsonRpcProvider(rpcUrl);
    })();

    const guarded = created.catch((error) => {
      if (this._ethereumMonitorProvider === guarded) {
        this._ethereumMonitorProvider = undefined;
      }
      throw error;
    });

    this._ethereumMonitorProvider = guarded;
    return guarded;
  }

  private async getSolanaConnection(protocol: Protocol) {
    const solanaWeb3 = await loadSolanaWeb3("Solana operations");
    const cluster = this.starknetWallet.getChainId().isMainnet()
      ? "mainnet-beta"
      : protocol === Protocol.LAYERSWAP
        ? "devnet" // Layerswap uses devnet
        : "testnet"; // Hyperlane uses testnet
    const endpoint =
      this.bridgingConfig?.solanaRpcUrl ?? solanaWeb3.clusterApiUrl(cluster);
    return new solanaWeb3.Connection(endpoint);
  }

  private get autoWithdrawFeesHandler(): AutoWithdrawFeesHandler {
    if (!this._autoWithdrawFeesHandler) {
      this._autoWithdrawFeesHandler = new AutoWithdrawFeesHandler({
        chainId: this.starknetWallet.getChainId(),
        provider: this.starknetWallet.getProvider(),
      });
    }
    return this._autoWithdrawFeesHandler;
  }
}
