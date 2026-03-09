import { BridgeCache } from "@/bridge/operator/BridgeCache";
import { BridgeToken, EthereumBridgeToken } from "@/types/bridge/bridge-token";
import type { BridgeInterface } from "@/bridge/types/BridgeInterface";
import { CanonicalEthereumBridge } from "@/bridge/ethereum/CanonicalEthereumBridge";
import { Protocol } from "@/types/bridge/protocol";
import {
  type FeeEstimation,
  isTokenForChain,
  type TxResponseFor,
} from "@/bridge/types/generics";
import {
  ConnectedEthereumWallet,
  type ConnectedExternalWallet,
} from "@/connect";
import type { WalletInterface } from "@/wallet";
import type { BridgeOperatorInterface } from "@/bridge/operator/BridgeOperatorInterface";
import type { Address } from "@/types";
import type { Amount } from "starkzap";

export class BridgeOperator implements BridgeOperatorInterface {
  private cache = new BridgeCache();

  constructor(private readonly starknetWallet: WalletInterface) {}

  public async deposit<T extends BridgeToken>(
    recipient: Address,
    amount: Amount,
    token: T,
    externalWallet: ConnectedExternalWallet<T>
  ): Promise<TxResponseFor<T>> {
    const bridge = await this.bridge(
      token,
      externalWallet,
      this.starknetWallet
    );
    return bridge.deposit(recipient, amount);
  }

  public async getDepositBalance<T extends BridgeToken>(
    token: T,
    externalWallet: ConnectedExternalWallet<T>
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
    externalWallet: ConnectedExternalWallet<T>
  ): Promise<FeeEstimation<T>> {
    const bridge = await this.bridge(
      token,
      externalWallet,
      this.starknetWallet
    );
    return bridge.getDepositFeeEstimate();
  }

  public async getAllowance<T extends BridgeToken>(
    token: T,
    externalWallet: ConnectedExternalWallet<T>
  ) {
    const bridge = await this.bridge(
      token,
      externalWallet,
      this.starknetWallet
    );
    return bridge.getAllowance();
  }

  public clearCache(): void {
    this.cache.clear();
  }

  private async bridge<T extends BridgeToken>(
    token: T,
    wallet: ConnectedExternalWallet<T>,
    starknetWallet: WalletInterface
  ): Promise<BridgeInterface<T>> {
    const key = `${token.id}:${wallet.address}`;

    const cached = this.cache.get<T>(key);
    if (cached) return cached;

    const bridge = await this.createBridge(token, wallet, starknetWallet);
    this.cache.set(key, bridge);
    return bridge;
  }

  private async createBridge<T extends BridgeToken>(
    token: T,
    wallet: ConnectedExternalWallet<T>,
    starknetWallet: WalletInterface
  ): Promise<BridgeInterface<T>> {
    if (isTokenForChain(token, "ethereum")) {
      return (await this.createEthereumBridge(
        token,
        wallet as ConnectedEthereumWallet,
        starknetWallet
      )) as unknown as BridgeInterface<T>;
    }

    throw new Error(`Unsupported chain "${token.chain}".`);
  }

  private async createEthereumBridge(
    token: EthereumBridgeToken,
    externalWallet: ConnectedEthereumWallet,
    starknetWallet: WalletInterface
  ): Promise<BridgeInterface<EthereumBridgeToken>> {
    const walletConfig = await externalWallet.toEthWalletConfig();

    switch (token.protocol) {
      case Protocol.CANONICAL:
        return new CanonicalEthereumBridge(token, walletConfig, starknetWallet);
      default:
        throw new Error(`Unsupported protocol "${token.protocol}".`);
    }
  }
}
