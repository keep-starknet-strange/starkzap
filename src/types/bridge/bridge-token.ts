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
  starknetAddress: Address;
}

/**
 * On-chain bridge-contract addresses, carried only by tokens whose bridge class
 * reads them to build a bridge `Contract` (canonical, Lords, OFT, Hyperlane).
 * Layerswap derives a per-swap deposit address from its API, and CCTP resolves
 * its contracts from chain-keyed constants; neither reads these, so they live on
 * the `ContractRouted*` token classes rather than the shared base — the
 * distinction is encoded in the type system instead of asserted at runtime.
 */
export interface BridgeContractAddresses<A extends ExternalAddress> {
  /** Source-chain (EVM/Solana) bridge contract address. */
  l1Bridge: A;
  /** Starknet-side bridge contract address. */
  starknetBridge: Address;
}

export abstract class BridgeToken<A extends ExternalAddress = ExternalAddress> {
  readonly id: string;
  readonly name: string;
  readonly symbol: string;
  readonly coingeckoId?: string;
  readonly decimals: number;

  readonly address: A;
  readonly starknetAddress: Address;

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
    this.starknetAddress = params.starknetAddress;
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
    super(params);
    this.protocol = params.protocol;
    this.supportsAutoWithdraw = params.supportsAutoWithdraw;
  }
}

export interface ContractRoutedEthereumBridgeTokenParams
  extends EthereumBridgeTokenParams, BridgeContractAddresses<EthereumAddress> {}

/**
 * An Ethereum bridge token that routes through fixed bridge contracts
 * (canonical, Lords, OFT). Carries the L1 and Starknet bridge addresses
 * as required fields, so consumers read them without optional-chaining or
 * runtime assertions.
 */
export class ContractRoutedEthereumBridgeToken extends EthereumBridgeToken {
  readonly bridgeAddress: EthereumAddress;
  readonly starknetBridge: Address;

  constructor(params: ContractRoutedEthereumBridgeTokenParams) {
    super(params);
    this.bridgeAddress = params.l1Bridge;
    this.starknetBridge = params.starknetBridge;
  }
}

export interface SolanaBridgeTokenParams extends BridgeTokenParams<SolanaAddress> {
  protocol: SolanaBridgeProtocol;
}

export class SolanaBridgeToken extends BridgeToken<SolanaAddress> {
  readonly chain: ExternalChain = ExternalChain.SOLANA;
  readonly protocol: SolanaBridgeProtocol;

  constructor(params: SolanaBridgeTokenParams) {
    super(params);
    this.protocol = params.protocol;
  }
}

export interface ContractRoutedSolanaBridgeTokenParams
  extends SolanaBridgeTokenParams, BridgeContractAddresses<SolanaAddress> {}

/**
 * A Solana bridge token that routes through fixed bridge contracts (Hyperlane).
 * Carries the L1 and Starknet bridge addresses as required fields.
 */
export class ContractRoutedSolanaBridgeToken extends SolanaBridgeToken {
  readonly bridgeAddress: SolanaAddress;
  readonly starknetBridge: Address;

  constructor(params: ContractRoutedSolanaBridgeTokenParams) {
    super(params);
    this.bridgeAddress = params.l1Bridge;
    this.starknetBridge = params.starknetBridge;
  }
}
