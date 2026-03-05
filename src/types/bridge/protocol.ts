export enum Protocol {
  CANONICAL = "canonical",
  CCTP = "cctp",
  OFT = "oft",
  OFT_MIGRATED = "oft-migrated",
  HYPERLANE = "hyperlane",
}

export type EthereumBridgeProtocol =
  | Protocol.CANONICAL
  | Protocol.CCTP
  | Protocol.OFT
  | Protocol.OFT_MIGRATED;

export type SolanaBridgeProtocol = Protocol.HYPERLANE;
