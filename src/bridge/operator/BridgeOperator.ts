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
  type EthereumAddress,
  type ExternalAddress,
  ExternalChain,
  type ExternalTransactionResponse,
  type SolanaAddress,
  SolanaBridgeToken,
} from "@/types";
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
      return await this.createSolanaBridge(
        token as SolanaBridgeToken,
        wallet as ConnectedSolanaWallet,
        starknetWallet
      );
    }

    throw new Error(`Unsupported chain "${token.chain}".`);
  }

  private async createEthereumBridge(
    token: EthereumBridgeToken,
    externalWallet: ConnectedEthereumWallet,
    starknetWallet: WalletInterface
  ): Promise<BridgeInterface<EthereumAddress>> {
    await loadEthers("Ethereum bridge operations");
    const walletConfig = await externalWallet.toEthWalletConfig(
      this.bridgingConfig?.ethereumRpcUrl
    );

    if (token.id === "lords") {
      const { LordsBridge } =
        await import("@/bridge/ethereum/lords/LordsBridge");
      return new LordsBridge(
        token,
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
          token,
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
        const apiKey = this.bridgingConfig?.layerZeroApiKey;
        if (!apiKey) {
          throw new Error(
            "OFT bridging requires a LayerZero API key. " +
              'Set "bridging.layerZeroApiKey" in the SDK configuration.'
          );
        }
        const { OftBridge } = await import("@/bridge/ethereum/oft/OftBridge");
        return new OftBridge(
          token,
          walletConfig,
          starknetWallet,
          apiKey,
          this.logger
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
    // SolanaHyperlaneBridge and @solana/web3.js are loaded lazily to avoid
    // pulling Node.js-only transitive dependencies into polyfill-requiring clients.
    const [{ SolanaHyperlaneBridge }, connection] = await Promise.all([
      import("@/bridge/solana/SolanaHyperlaneBridge"),
      this.getSolanaConnection(),
    ]);

    const walletConfig = {
      address: externalWallet.address,
      provider: externalWallet.provider,
      connection,
    };

    switch (token.protocol) {
      case Protocol.HYPERLANE:
        return await SolanaHyperlaneBridge.create(
          token,
          walletConfig,
          starknetWallet
        );
      default:
        throw new Error(
          `Unsupported protocol "${token.protocol}" for ${token.chain} chain.`
        );
    }
  }

  private async monitor(token: BridgeToken): Promise<BridgeMonitorInterface> {
    if (
      token.chain === ExternalChain.SOLANA &&
      token.protocol === Protocol.HYPERLANE
    ) {
      return this.getOrCreateMonitor(Protocol.HYPERLANE, async () => {
        const [{ SolanaHyperlaneMonitor }, { connection, hyperlane }] =
          await Promise.all([
            import("@/bridge/monitor/hyperlane/SolanaHyperlaneMonitor"),
            Promise.all([
              this.getSolanaConnection(),
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

  private async getSolanaConnection() {
    const solanaWeb3 = await loadSolanaWeb3("Solana operations");
    const cluster = this.starknetWallet.getChainId().isMainnet()
      ? "mainnet-beta"
      : "testnet";
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
