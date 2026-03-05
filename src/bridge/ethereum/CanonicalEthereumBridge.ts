import { EthereumBridge } from "@/bridge/ethereum/EthereumBridge";
import type { EthereumWalletConfig } from "@/bridge/ethereum/types";
import { type EthereumAddress, EthereumBridgeToken } from "@/types";
import { Contract } from "ethers";
import BRIDGE_ABI from "@/abi/ethereum/canonicalBridge.json";

export class CanonicalEthereumBridge extends EthereumBridge {
  private readonly bridge: Contract;

  constructor(token: EthereumBridgeToken, config: EthereumWalletConfig) {
    const ethereumToken = token.asEthereumToken(config.provider);
    super(ethereumToken, config);

    this.bridge = new Contract(token.bridgeAddress, BRIDGE_ABI, config.signer);
  }

  protected getAllowanceSpender(): Promise<EthereumAddress | null> {
    return Promise.resolve(null);
  }
}
