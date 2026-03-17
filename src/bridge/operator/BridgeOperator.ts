import { BridgeCache } from "@/bridge/operator/BridgeCache";
import { BridgeToken, EthereumBridgeToken } from "@/types/bridge/bridge-token";
import type {
  BridgeDepositOptions,
  BridgeInterface,
} from "@/bridge/types/BridgeInterface";
import { Protocol } from "@/types/bridge/protocol";
import {
  ConnectedEthereumWallet,
  ConnectedSolanaWallet,
  type ConnectedExternalWallet,
  SolanaNetwork,
} from "@/connect";
import type { WalletInterface } from "@/wallet";
import type { BridgeOperatorInterface } from "@/bridge/operator/BridgeOperatorInterface";
import {
  type Address,
  type Amount,
  type BridgeDepositFeeEstimation,
  type BridgingConfig,
  type EthereumAddress,
  ExternalChain,
  type ExternalTransactionResponse,
  type SolanaAddress,
  SolanaBridgeToken,
} from "@/types";
import { loadEthers } from "@/connect/ethersRuntime";
import { loadSolanaWeb3 } from "@/connect/solanaWeb3Runtime";

export class BridgeOperator implements BridgeOperatorInterface {
  private cache = new BridgeCache();

  constructor(
    private readonly starknetWallet: WalletInterface,
    private readonly bridgingConfig?: BridgingConfig
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
      return new LordsBridge(token, walletConfig, starknetWallet);
    }

    switch (token.protocol) {
      case Protocol.CANONICAL: {
        const { CanonicalEthereumBridge } =
          await import("@/bridge/ethereum/canonical/CanonicalEthereumBridge");
        return new CanonicalEthereumBridge(token, walletConfig, starknetWallet);
      }
      case Protocol.CCTP: {
        const { CCTPBridge } =
          await import("@/bridge/ethereum/cctp/CCTPBridge");
        return new CCTPBridge(token, walletConfig, starknetWallet);
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
        return new OftBridge(token, walletConfig, starknetWallet, apiKey);
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
    // SolanaHyperlaneBridge and @solana/web3.js are loaded lazily in
    // to avoid pulling Node.js-only transitive dependencies
    // (@hyperlane-xyz/sdk → ethereumjs-util → assert, etc.)
    // into clients that require polyfill.
    const [{ SolanaHyperlaneBridge }, solanaWeb3] = await Promise.all([
      import("@/bridge/solana/SolanaHyperlaneBridge"),
      loadSolanaWeb3("Solana bridge operations"),
    ]);

    const cluster =
      externalWallet.network === SolanaNetwork.MAINNET
        ? "mainnet-beta"
        : "testnet";
    const endpoint =
      this.bridgingConfig?.solanaRpcUrl ?? solanaWeb3.clusterApiUrl(cluster);
    const connection = new solanaWeb3.Connection(endpoint);

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
}
