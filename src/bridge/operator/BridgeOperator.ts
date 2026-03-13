import { BridgeCache } from "@/bridge/operator/BridgeCache";
import { BridgeToken, EthereumBridgeToken } from "@/types/bridge/bridge-token";
import type {
  BridgeDepositOptions,
  BridgeInterface,
} from "@/bridge/types/BridgeInterface";
import { CanonicalEthereumBridge } from "@/bridge/ethereum/canonical/CanonicalEthereumBridge";
import { Protocol } from "@/types/bridge/protocol";
import {
  ConnectedEthereumWallet,
  type ConnectedExternalWallet,
} from "@/connect";
import type { WalletInterface } from "@/wallet";
import type { BridgeOperatorInterface } from "@/bridge/operator/BridgeOperatorInterface";
import {
  type Address,
  type BridgeDepositFeeEstimation,
  type BridgingConfig,
  type EthereumAddress,
  ExternalChain,
  type ExternalTransactionResponse,
  type SolanaAddress,
} from "@/types";
import {
  type Amount,
  ConnectedSolanaWallet,
  SolanaBridgeToken,
} from "starkzap";
import { CCTPBridge } from "@/bridge/ethereum/cctp/CCTPBridge";
import { LordsBridge } from "@/bridge/ethereum/lords/LordsBridge";
import { OftBridge } from "@/bridge/ethereum/oft/OftBridge";
import { SolanaHyperlaneBridge } from "@/bridge/solana/SolanaHyperlaneBridge";

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

    if (token.chain == ExternalChain.ETHEREUM) {
      return await this.createEthereumBridge(
        token as EthereumBridgeToken,
        wallet as ConnectedEthereumWallet,
        starknetWallet
      );
    } else if (token.chain == ExternalChain.SOLANA) {
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
    const walletConfig = await externalWallet.toEthWalletConfig();

    if (token.id === "lords") {
      return new LordsBridge(token, walletConfig, starknetWallet);
    }

    switch (token.protocol) {
      case Protocol.CANONICAL:
        return new CanonicalEthereumBridge(token, walletConfig, starknetWallet);
      case Protocol.CCTP:
        return new CCTPBridge(token, walletConfig, starknetWallet);
      case Protocol.OFT:
      case Protocol.OFT_MIGRATED: {
        const apiKey = this.bridgingConfig?.layerZeroApiKey;
        if (!apiKey) {
          throw new Error(
            "OFT bridging requires a LayerZero API key. " +
              'Set "bridging.layerZeroApiKey" in the SDK configuration.'
          );
        }
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
    const walletConfig = externalWallet.toSolanaWalletConfig(
      this.bridgingConfig?.solanaRpcUrl
    );

    switch (token.protocol) {
      case Protocol.HYPERLANE:
        return new SolanaHyperlaneBridge(token, walletConfig, starknetWallet);
      default:
        throw new Error(
          `Unsupported protocol "${token.protocol}" for ${token.chain} chain.`
        );
    }
  }
}
