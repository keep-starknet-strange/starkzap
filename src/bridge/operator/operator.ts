import {
  type AddressFor,
  BridgeCache,
  isTokenForChain,
} from "@/bridge/operator/BridgeCache";
import {
  BridgeToken,
  type EthereumAddress,
  EthereumBridgeToken,
  ExternalChain,
} from "@/types";
import { Protocol } from "starkzap";
import type { BridgeInterface } from "@/bridge/BridgeInterface";
import type { EthereumWalletConfig } from "@/bridge/ethereum/types";
import { CanonicalEthereumBridge } from "@/bridge/ethereum/CanonicalEthereumBridge";
import type { TransactionResponse } from "ethers";

export class BridgeOperator {
  private cache = new BridgeCache();

  private ethConfig: EthereumWalletConfig | null = null;

  public connectEth(config: EthereumWalletConfig) {
    this.ethConfig = config;
  }

  public getDepositBalance<T extends BridgeToken>(
    token: T,
    account: AddressFor<T>
  ) {
    const bridge = this.cache.getOrCreate(token, () => this.bridge(token));
    return bridge.getAvailableDepositBalance(account);
  }

  private bridge(
    token: EthereumBridgeToken
  ): BridgeInterface<EthereumAddress, TransactionResponse>;
  private bridge(token: BridgeToken): BridgeInterface<string, unknown>;
  private bridge(token: BridgeToken): BridgeInterface<string, unknown> {
    if (isTokenForChain(token, ExternalChain.ETHEREUM)) {
      switch (token.protocol) {
        case Protocol.CANONICAL: {
          if (!this.ethConfig) throw new Error("Ethereum wallet not connected");
          return new CanonicalEthereumBridge(token, this.ethConfig);
        }
        default:
          throw new Error(`Unsupported protocol ${token.protocol}`);
      }
    }

    throw new Error(`Unsupported chain ${token.chain}`);
  }
}
