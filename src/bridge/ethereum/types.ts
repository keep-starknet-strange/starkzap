import { type Provider, type Signer } from "ethers";

export type EthereumWalletConfig = {
  signer: Signer;
  provider: Provider;
};
