export enum Protocol {
  CANONICAL = "canonical",
  CCTP = "cctp",
  OFT = "oft",
  OFT_MIGRATED = "oft-migrated",
  HYPERLANE = "hyperlane",
  LAYERSWAP = "layerswap",
}

export type EthereumBridgeProtocol =
  | Protocol.CANONICAL
  | Protocol.CCTP
  | Protocol.OFT
  | Protocol.OFT_MIGRATED
  | Protocol.LAYERSWAP;

export type SolanaBridgeProtocol = Protocol.HYPERLANE | Protocol.LAYERSWAP;
