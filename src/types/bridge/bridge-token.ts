import {
  Protocol,
  type EthereumBridgeProtocol,
  type SolanaBridgeProtocol,
} from "@/types/bridge/protocol";
import { ExternalChain } from "@/types/bridge/external-chain";
import type {
  Address,
  EthereumAddress,
  ExternalAddress,
  SolanaAddress,
  Token,
} from "@/types";

export interface BridgeTokenParams<A extends ExternalAddress> {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  coingeckoId?: string;
  protocol: Protocol;
  address: A;
  l1Bridge: A;
  starknetAddress: Address;
  starknetBridge: Address;
}

export abstract class BridgeToken<A extends ExternalAddress = ExternalAddress> {
  readonly id: string;
  readonly name: string;
  readonly symbol: string;
  readonly coingeckoId?: string;
  readonly decimals: number;

  readonly address: A;
  readonly bridgeAddress: A;
  readonly starknetAddress: Address;
  readonly starknetBridge: Address;

  abstract readonly protocol: Protocol;
  abstract readonly chain: ExternalChain;

  protected constructor(params: BridgeTokenParams<A>) {
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

  intoStarknetToken(): Token {
    return {
      name: this.name,
      address: this.starknetAddress,
      decimals: this.decimals,
      symbol: this.symbol,
    };
  }
}

export interface EthereumBridgeTokenParams extends BridgeTokenParams<EthereumAddress> {
  protocol: EthereumBridgeProtocol;
  supportsAutoWithdraw: boolean;
}

export class EthereumBridgeToken extends BridgeToken<EthereumAddress> {
  readonly chain: ExternalChain = ExternalChain.ETHEREUM;
  readonly protocol: EthereumBridgeProtocol;
  readonly supportsAutoWithdraw: boolean;

  constructor(params: EthereumBridgeTokenParams) {
    super({ ...params });
    this.protocol = params.protocol;
    this.supportsAutoWithdraw = params.supportsAutoWithdraw;
  }
}

export interface SolanaBridgeTokenParams extends BridgeTokenParams<SolanaAddress> {
  protocol: Protocol.HYPERLANE;
}

export class SolanaBridgeToken extends BridgeToken<SolanaAddress> {
  readonly chain: ExternalChain = ExternalChain.SOLANA;
  readonly protocol: SolanaBridgeProtocol = Protocol.HYPERLANE;

  constructor(params: SolanaBridgeTokenParams) {
    super({ ...params });
  }
}
