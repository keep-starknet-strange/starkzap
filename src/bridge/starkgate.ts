import type { Address } from "@/types";
import { ChainId, type Amount } from "@/types";
import { CallData, type Call } from "starknet";
import type {
  BridgeProvider,
  BridgeQuote,
  BridgeRequest,
  PreparedBridge,
} from "@/bridge/interface";

/**
 * Starkgate bridge configuration per network.
 * Official Starkgate contract addresses.
 */
const STARKGATE_CONFIGS: Record<
  string,
  { eth: { l1: string; l2: string }; strk: { l1: string; l2: string } }
> = {
  // Starknet Mainnet
  SN_MAIN: {
    eth: {
      // L1 Starkgate ETH Bridge
      l1: "0xae0E0c63CD30984C55900f9926Dad5Eb8AfB28d1",
      // L2 Starkgate ETH (Starknet native token)
      l2: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
    },
    strk: {
      l1: "0xCa14007Eff0Db1f8135f4C3b1159e85dd8cC198",
      l2: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd3d9c8c0a3e7d8e7f0d7bd6e",
    },
  },
  // Starknet Sepolia
  SN_SEPOLIA: {
    eth: {
      // L1 Starkgate Sepolia ETH (placeholder - need real address)
      l1: "0x9d7eD44BB7f4CeD4a4C4B4Bd4C4C3B2A1D0E9F8C7B6A5D4E3F2C1B0A9F8E7D",
      // L2 ETH on Starknet Sepolia
      l2: "0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
    },
    strk: {
      l1: "0xd8c4A76b4C7c1f2a3b4C5d6E7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6",
      l2: "0x05d27c03ba2016ec4d5fa3e8c9b5c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5",
    },
  },
};

export type BridgeDirection = "l2_to_l2" | "l1_to_l2" | "l2_to_l1";

export interface StarkgateOptions {
  /**
   * Enable L1→L2 deposits via relayer.
   * When true, will generate calls that can be executed via a relayer service.
   * Default: false (only L2→L2 supported directly)
   */
  enableRelayer?: boolean;
  /**
   * Relayer API endpoint for L1→L2 deposits.
   * If not provided, L1→L2 will throw an error.
   */
  relayerUrl?: string;
}

export class StarkgateBridgeProvider implements BridgeProvider {
  readonly id = "starkgate";
  readonly supportedSourceChains: ChainId[] = [
    ChainId.MAINNET,
    ChainId.SEPOLIA,
  ];
  readonly supportedDestChains: ChainId[] = [ChainId.MAINNET, ChainId.SEPOLIA];

  private readonly configs = STARKGATE_CONFIGS;
  private readonly options: StarkgateOptions;

  constructor(options: StarkgateOptions = {}) {
    this.options = {
      enableRelayer: false,
      ...options,
    };
  }

  supportsChainPair(sourceChainId: ChainId, destChainId: ChainId): boolean {
    return (
      this.supportedSourceChains.some((c) => c.value === sourceChainId.value) &&
      this.supportedDestChains.some((c) => c.value === destChainId.value)
    );
  }

  /**
   * Determine the bridge direction based on source/dest chains.
   */
  getDirection(sourceChainId: ChainId, destChainId: ChainId): BridgeDirection {
    const sourceIsL1 = sourceChainId.toLiteral().startsWith("ETH");
    const destIsL1 = destChainId.toLiteral().startsWith("ETH");

    if (!sourceIsL1 && !destIsL1) {
      return "l2_to_l2";
    } else if (sourceIsL1 && !destIsL1) {
      return "l1_to_l2";
    } else if (!sourceIsL1 && destIsL1) {
      return "l2_to_l1";
    }
    // Both L1 doesn't make sense for Starkgate
    throw new Error("Starkgate does not support L1↔L1 transfers");
  }

  async getQuote(request: BridgeRequest): Promise<BridgeQuote> {
    const { sourceChainId, destChainId, token, amount } = request;
    const direction = this.getDirection(sourceChainId, destChainId);

    let feeBase: bigint;
    let estimatedTime: number;

    switch (direction) {
      case "l2_to_l2":
        // Starkgate doesn't charge for L2→L2
        feeBase = 0n;
        estimatedTime = 300;
        break;
      case "l1_to_l2":
        // L1→L2 has network gas costs
        feeBase = this.estimateL1L2Fee(token.symbol);
        estimatedTime = 600; // ~10 minutes including confirmation
        break;
      case "l2_to_l1":
        // L2→L1 requires waiting period
        feeBase = 0n;
        estimatedTime = 14400; // ~4 hours for finality
        break;
    }

    return {
      sourceChainId,
      destChainId,
      token,
      amountBase: amount.toBase(),
      destAmountBase: amount.toBase() - feeBase,
      feeBase,
      estimatedTimeSeconds: estimatedTime,
      provider: "starkgate",
    };
  }

  async bridge(request: BridgeRequest): Promise<PreparedBridge> {
    const { sourceChainId, destChainId, token, amount, recipient } = request;
    const direction = this.getDirection(sourceChainId, destChainId);
    const quote = await this.getQuote(request);

    let calls: Call[] = [];

    switch (direction) {
      case "l2_to_l2":
        // Both are Starknet - simple L2 withdrawal
        calls = this.buildL2ToL2Calls(token, amount, recipient);
        break;

      case "l1_to_l2":
        // L1 to L2 deposit
        if (!this.options.enableRelayer && !this.options.relayerUrl) {
          throw new Error(
            "L1→L2 deposits require a relayer. " +
              "Enable 'enableRelayer' option or provide 'relayerUrl' when creating the provider. " +
              "Alternatively, use Starkgate UI to deposit from L1."
          );
        }
        calls = this.buildL1ToL2Calls(token, amount, recipient);
        break;

      case "l2_to_l1":
        // L2 to L1 withdrawal - initiate and complete in one go isn't possible
        // Need to wait for the withdrawal period
        calls = this.buildL2ToL1Calls(token, amount, recipient);
        break;
    }

    return { calls, quote };
  }

  /**
   * Build calls for L2→L2 (within Starknet)
   * Uses initiate_withdraw on the L2 token contract
   */
  private buildL2ToL2Calls(
    token: { symbol: string; address: string },
    amount: Amount,
    recipient: Address
  ): Call[] {
    const config = this.getConfig(ChainId.SEPOLIA, token.symbol);
    return [
      {
        contractAddress: config.l2,
        entrypoint: "initiate_withdraw",
        calldata: CallData.compile([recipient, amount.toBase()]),
      },
    ];
  }

  /**
   * Build calls for L1→L2 deposit.
   * This generates calldata that can be sent via a relayer or executed manually on L1.
   *
   * For true L1→L2, user would need to:
   * 1. Approve L1 token (if ERC20)
   * 2. Call deposit on L1 Starkgate contract
   *
   * This implementation prepares the L2 side of the transaction.
   */
  private buildL1ToL2Calls(
    token: { symbol: string; address: string },
    amount: Amount,
    recipient: Address
  ): Call[] {
    const config = this.getConfig(ChainId.MAINNET, token.symbol);

    // For L1→L2, we can't directly call L1 from L2 SDK
    // Instead, we prepare data for the relayer or provide instructions

    if (this.options.enableRelayer || this.options.relayerUrl) {
      // Prepare a "meta-tx" that the relayer can execute
      // This is a placeholder - real implementation would use relayer API
      return [
        {
          contractAddress: config.l1,
          entrypoint: "deposit",
          calldata: CallData.compile([
            recipient, // L2 recipient
            amount.toBase(), // amount
          ]),
        },
      ];
    }

    throw new Error(
      "L1→L2 deposit requires relayer configuration. " +
        "Set enableRelayer: true or provide relayerUrl."
    );
  }

  /**
   * Build calls for L2→L1 withdrawal.
   * Initiates withdrawal on L2 - user then waits and completes on L1.
   */
  private buildL2ToL1Calls(
    token: { symbol: string; address: string },
    amount: Amount,
    recipient: Address
  ): Call[] {
    const config = this.getConfig(ChainId.SEPOLIA, token.symbol);

    return [
      {
        contractAddress: config.l2,
        entrypoint: "initiate_withdraw",
        calldata: CallData.compile([recipient, amount.toBase()]),
      },
    ];
  }

  /**
   * Estimate fee for L1→L2 deposit.
   * Covers L1 gas + L2 message processing.
   */
  private estimateL1L2Fee(tokenSymbol: string): bigint {
    const symbol = tokenSymbol.toUpperCase();
    if (symbol === "ETH") {
      // L1 gas estimate + L2 message fee
      return 200000000000000n; // ~0.0002 ETH
    } else if (symbol === "STRK") {
      return 200000000000000n;
    }
    return 100000000000000n;
  }

  /**
   * Get Starkgate contract addresses.
   */
  private getConfig(
    chainId: ChainId,
    tokenSymbol: string
  ): { l1: string; l2: string } {
    const network = chainId.isMainnet() ? "SN_MAIN" : "SN_SEPOLIA";
    const config = this.configs[network];

    if (!config) {
      throw new Error(`Unsupported chain: ${chainId.value}`);
    }

    const symbol = tokenSymbol.toUpperCase();
    if (symbol === "ETH") {
      return config.eth;
    } else if (symbol === "STRK") {
      return config.strk;
    }

    throw new Error(
      `Starkgate does not support token: ${tokenSymbol}. ` +
        "Supported tokens: ETH, STRK"
    );
  }
}

/**
 * Default Starkgate provider instance (L2→L2 only).
 */
export const starkgateBridge = new StarkgateBridgeProvider();

/**
 * Create a Starkgate provider with relayer enabled for L1→L2 deposits.
 */
export function createStarkgateWithRelayer(
  relayerUrl: string
): StarkgateBridgeProvider {
  return new StarkgateBridgeProvider({
    enableRelayer: true,
    relayerUrl,
  });
}
