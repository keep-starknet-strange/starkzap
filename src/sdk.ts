import { RpcProvider, Account, Contract } from "starknet";
import { Networks, RpcUrls, NetworkConfig } from "./types";
import { getRpcUrl, getChainId } from "./config";

export class StarkSDK {
  private provider: RpcProvider;
  private account: Account | null = null;
  private network: string;

  constructor(config: { network?: string; rpcUrl?: string; privateKey?: string; accountId?: string }) {
    const network = config.network?.trim();
    if (network && !Object.values(Networks).includes(network as Networks)) {
      throw new Error(`Invalid network "${network}". Valid options: ${Object.values(Networks).join(", ")}`);
    }

    this.network = network || "mainnet";
    this.provider = new RpcProvider({ nodeUrl: config.rpcUrl || getRpcUrl(this.network) });

    if (config.privateKey && config.accountId) {
      this.account = new Account(this.provider, config.accountId, config.privateKey, "hex");
    }
  }

  getProvider(): RpcProvider {
    return this.provider;
  }

  getAccount(): Account | null {
    return this.account;
  }

  async getChainId(): Promise<string> {
    return getChainId(this.network);
  }
}

export { Networks, RpcUrls, NetworkConfig };
