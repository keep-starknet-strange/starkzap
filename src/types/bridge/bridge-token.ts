import {
  Protocol,
  type EthereumBridgeProtocol,
  type SolanaBridgeProtocol,
} from "@/types/bridge/protocol";
import { ExternalChain } from "@/types/bridge/external-chain";
import {
  ERC20EthereumToken,
  EthereumToken,
  type EthereumTokenInterface,
} from "@/bridge/ethereum/EthereumToken";
import type { Provider } from "ethers";
import type { Address, EthereumAddress } from "@/types";

export interface BridgeTokenParams<TAddress extends string = string> {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  coingeckoId?: string;
  protocol: Protocol;
  address: TAddress;
  l1Bridge: TAddress;
  starknetAddress: Address;
  starknetBridge: Address;
}

export abstract class BridgeToken<TAddress extends string = string> {
  readonly id: string;
  readonly name: string;
  readonly symbol: string;
  readonly coingeckoId?: string;
  readonly decimals: number;

  readonly address: TAddress;
  readonly bridgeAddress: TAddress;
  readonly starknetAddress: Address;
  readonly starknetBridge: Address;

  abstract readonly protocol: Protocol;
  abstract readonly chain: ExternalChain;

  protected constructor(params: BridgeTokenParams<TAddress>) {
    this.id = params.id;
    this.name = params.name;
    this.symbol = params.symbol;
    if (params.coingeckoId) {
      this.coingeckoId = params.coingeckoId;
    }
    this.decimals = params.decimals;

    this.address = params.address;
    this.bridgeAddress = params.l1Bridge;
    this.starknetAddress = params.starknetAddress;
    this.starknetBridge = params.starknetBridge;
  }
}

export interface EthereumBridgeTokenParams extends BridgeTokenParams<EthereumAddress> {
  protocol: EthereumBridgeProtocol;
}

export class EthereumBridgeToken extends BridgeToken<EthereumAddress> {
  readonly chain: ExternalChain = ExternalChain.ETHEREUM;
  readonly protocol: EthereumBridgeProtocol;

  constructor(params: EthereumBridgeTokenParams) {
    super({ ...params });
    this.protocol = params.protocol;
  }

  public asEthereumToken(provider: Provider): EthereumTokenInterface {
    if (this.id == "eth") {
      return EthereumToken.create(provider);
    } else {
      return ERC20EthereumToken.create(this.address, provider);
    }
  }
}

export interface SolanaBridgeTokenParams extends BridgeTokenParams<string> {
  protocol: Protocol.HYPERLANE;
}

export class SolanaBridgeToken extends BridgeToken {
  readonly chain: ExternalChain = ExternalChain.SOLANA;
  readonly protocol: SolanaBridgeProtocol = Protocol.HYPERLANE;

  constructor(params: SolanaBridgeTokenParams) {
    super({ ...params });
    this.protocol = params.protocol;
  }
}
