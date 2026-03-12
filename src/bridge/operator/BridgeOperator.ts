import { BridgeCache } from "@/bridge/operator/BridgeCache";
import { BridgeToken, EthereumBridgeToken } from "@/types/bridge/bridge-token";
import type {
  BridgeDepositOptions,
  BridgeInterface,
} from "@/bridge/types/BridgeInterface";
import { CanonicalEthereumBridge } from "@/bridge/ethereum/canonical/CanonicalEthereumBridge";
import { Protocol } from "@/types/bridge/protocol";
import {
  type AddressFor,
  type FeeEstimationFor,
  isTokenForChain,
  type TxResponseFor,
} from "@/bridge/types/generics";
import {
  ConnectedEthereumWallet,
  type ConnectedExternalWallet,
} from "@/connect";
import type { WalletInterface } from "@/wallet";
import type { BridgeOperatorInterface } from "@/bridge/operator/BridgeOperatorInterface";
import type { Address, BridgingConfig, EthereumAddress } from "@/types";
import type { Amount } from "starkzap";
import { CCTPBridge } from "@/bridge/ethereum/cctp/CCTPBridge";
import { LordsBridge } from "@/bridge/ethereum/lords/LordsBridge";
import { OftBridge } from "@/bridge/ethereum/oft/OftBridge";
import type { EthereumDepositFeeEstimation } from "@/bridge/ethereum/types";
import type { TransactionResponse } from "ethers";

export type BridgeType<T extends BridgeToken> = BridgeInterface<
  AddressFor<T>,
  TxResponseFor<T>,
  FeeEstimationFor<T>
>;

export class BridgeOperator implements BridgeOperatorInterface {
  private cache = new BridgeCache();

  constructor(
    private readonly starknetWallet: WalletInterface,
    private readonly bridgingConfig?: BridgingConfig
  ) {}

  public async deposit<T extends BridgeToken>(
    recipient: Address,
    amount: Amount,
    token: T,
    externalWallet: ConnectedExternalWallet<AddressFor<T>>,
    options?: BridgeDepositOptions
  ): Promise<TxResponseFor<T>> {
    const bridge = await this.bridge(
      token,
      externalWallet,
      this.starknetWallet
    );
    return bridge.deposit(recipient, amount, options);
  }

  public async getDepositBalance<T extends BridgeToken>(
    token: T,
    externalWallet: ConnectedExternalWallet<AddressFor<T>>
  ) {
    const bridge = await this.bridge(
      token,
      externalWallet,
      this.starknetWallet
    );
    return bridge.getAvailableDepositBalance(externalWallet.address);
  }

  async getDepositFeeEstimate<T extends BridgeToken>(
    token: T,
    externalWallet: ConnectedExternalWallet<AddressFor<T>>,
    options?: BridgeDepositOptions
  ): Promise<FeeEstimationFor<T>> {
    const bridge = await this.bridge(
      token,
      externalWallet,
      this.starknetWallet
    );
    return bridge.getDepositFeeEstimate(options);
  }

  public async getAllowance<T extends BridgeToken>(
    token: T,
    externalWallet: ConnectedExternalWallet<AddressFor<T>>
  ) {
    const bridge = await this.bridge(
      token,
      externalWallet,
      this.starknetWallet
    );
    return bridge.getAllowance();
  }

  private bridge<T extends BridgeToken>(
    token: T,
    wallet: ConnectedExternalWallet<AddressFor<T>>,
    starknetWallet: WalletInterface
  ): Promise<BridgeType<T>> {
    const cached = this.cache.get(token, wallet);
    if (cached) return cached;

    const promise = this.createBridge(token, wallet, starknetWallet);
    this.cache.set(token, wallet, promise);
    return promise;
  }

  private async createBridge<T extends BridgeToken>(
    token: T,
    wallet: ConnectedExternalWallet<AddressFor<T>>,
    starknetWallet: WalletInterface
  ): Promise<BridgeType<T>> {
    if (isTokenForChain(token, "ethereum")) {
      return (await this.createEthereumBridge(
        token,
        wallet as ConnectedEthereumWallet,
        starknetWallet
      )) as unknown as BridgeType<T>;
    }

    throw new Error(`Unsupported chain "${token.chain}".`);
  }

  private async createEthereumBridge(
    token: EthereumBridgeToken,
    externalWallet: ConnectedEthereumWallet,
    starknetWallet: WalletInterface
  ): Promise<
    BridgeInterface<
      EthereumAddress,
      TransactionResponse,
      EthereumDepositFeeEstimation
    >
  > {
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
        throw new Error(`Unsupported protocol "${token.protocol}".`);
    }
  }
}
