import { BridgeProtocol } from "@/bridge/bridge-protocol";
import { ExternalChain } from "@/bridge/external-chain";

export interface BridgeTokenBaseParams {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  l2TokenAddress: string;
  coingeckoId?: string;
}

export interface BridgeTokenParams extends BridgeTokenBaseParams {
  chain: ExternalChain;
  protocol: BridgeProtocol;
}

export abstract class BridgeToken {
  readonly id: string;
  readonly name: string;
  readonly symbol: string;
  readonly coingeckoId?: string;
  readonly decimals: number;
  readonly l2TokenAddress: string;
  readonly chain: ExternalChain;
  readonly protocol: BridgeProtocol;

  protected constructor(params: BridgeTokenParams) {
    this.id = params.id;
    this.name = params.name;
    this.symbol = params.symbol;
    if (params.coingeckoId) {
      this.coingeckoId = params.coingeckoId;
    }
    this.decimals = params.decimals;
    this.l2TokenAddress = params.l2TokenAddress;
    this.chain = params.chain;
    this.protocol = params.protocol;
  }
}

export type EthereumBridgeProtocol =
  | BridgeProtocol.CANONICAL
  | BridgeProtocol.CCTP
  | BridgeProtocol.OFT
  | BridgeProtocol.OFT_MIGRATED;

export interface EthereumBridgeTokenParams extends BridgeTokenBaseParams {
  protocol: EthereumBridgeProtocol;
  l1TokenAddress: string;
  l1BridgeAddress: string;
  l2FeeTokenAddress?: string;
}

export class EthereumBridgeToken extends BridgeToken {
  readonly l1TokenAddress: string;
  readonly l1BridgeAddress: string;
  readonly l2FeeTokenAddress?: string;

  constructor(params: EthereumBridgeTokenParams) {
    super({
      ...params,
      chain: ExternalChain.ETHEREUM,
    });
    this.l1TokenAddress = params.l1TokenAddress;
    this.l1BridgeAddress = params.l1BridgeAddress;
    if (params.l2FeeTokenAddress) {
      this.l2FeeTokenAddress = params.l2FeeTokenAddress;
    }
  }
}

export interface SolanaBridgeTokenParams extends BridgeTokenBaseParams {
  protocol: BridgeProtocol.HYPERLANE;
  solanaTokenAddress: string;
  solanaDecimals: number;
}

export class SolanaBridgeToken extends BridgeToken {
  readonly solanaTokenAddress: string;
  readonly solanaDecimals: number;

  constructor(params: SolanaBridgeTokenParams) {
    super({
      ...params,
      chain: ExternalChain.SOLANA,
    });
    this.solanaTokenAddress = params.solanaTokenAddress;
    this.solanaDecimals = params.solanaDecimals;
  }
}

export interface BitcoinRunesBridgeTokenParams extends BridgeTokenBaseParams {
  protocol: BridgeProtocol.BITCOIN_RUNES;
  bitcoinRuneId: string;
  runesBridgeAddress: string;
}

export class BitcoinRunesBridgeToken extends BridgeToken {
  readonly bitcoinRuneId: string;
  readonly runesBridgeAddress: string;

  constructor(params: BitcoinRunesBridgeTokenParams) {
    super({
      ...params,
      chain: ExternalChain.BITCOIN_RUNES,
    });
    this.bitcoinRuneId = params.bitcoinRuneId;
    this.runesBridgeAddress = params.runesBridgeAddress;
  }
}
