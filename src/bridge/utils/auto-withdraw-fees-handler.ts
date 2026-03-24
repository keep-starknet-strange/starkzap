import {
  type Address,
  Amount,
  BridgeToken,
  type ChainId,
  type ChainIdLiteral,
  fromAddress,
  type Token,
} from "@/types";
import { Erc20 } from "@/erc20";
import { resolveFetch } from "@/utils";
import type { WalletInterface } from "@/wallet";
import { type BigNumberish, type RpcProvider } from "starknet";

export interface AutoWithdrawFeesHandlerOptions {
  chainId: ChainId;
  provider: RpcProvider;
  fetchFn?: typeof fetch;
  now?: () => number;
}

export interface AutoWithdrawFeeInput {
  bridgeToken: BridgeToken;
  amount: Amount;
  walletOrAddress: WalletInterface | Address | BigNumberish;
}

export interface AutoWithdrawFeeOutput {
  relayerAddress: Address;
  gasCosts: Map<Token, Amount>;
}

interface AutoWithdrawData {
  relayerAddress: Address;
  gasCosts: Map<Address, bigint>;
}

export class AutoWithdrawFeesHandler {
  private static GAS_COST_SERVICE: Record<ChainIdLiteral, string> = {
    SN_MAIN: "https://starkgate.spaceshard.io/v2/gas-cost",
    SN_SEPOLIA: "https://starkgate-sepolia.spaceshard.io/v2/gas-cost",
  } as const;

  private readonly serviceUrl: string;
  private readonly provider: RpcProvider;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;

  constructor(options: AutoWithdrawFeesHandlerOptions) {
    this.serviceUrl =
      AutoWithdrawFeesHandler.GAS_COST_SERVICE[options.chainId.toLiteral()];
    this.provider = options.provider;
    this.fetchFn = resolveFetch(options.fetchFn);
    this.now = options.now ?? Date.now;
  }

  async getFeeData(
    input: AutoWithdrawFeeInput
  ): Promise<AutoWithdrawFeeOutput> {
    const { relayerAddress, gasCosts } = await this.fetchAutoWithdrawData(
      input.bridgeToken.starknetBridge
    );

    const affordableGasCosts = new Map<Token, Amount>();

    for (const [feeTokenAddress, rawGasCost] of gasCosts) {
      const erc20 = await Erc20.fromAddress(feeTokenAddress, this.provider);
      const balance = await erc20.balanceOf(input.walletOrAddress);
      const gasCostAmount = Amount.fromRaw(rawGasCost, erc20.token);

      // If withdrawing the bridge token, subtract the pending withdrawal amount
      // from the available balance before checking against the gas cost.
      const isFeeTokenTheBridgedToken =
        feeTokenAddress === input.bridgeToken.starknetAddress;
      if (isFeeTokenTheBridgedToken && balance.lt(input.amount)) continue; // User cannot afford auto-withdraw

      const effectiveBalance = isFeeTokenTheBridgedToken
        ? balance.subtract(input.amount)
        : balance;

      if (effectiveBalance.gte(gasCostAmount)) {
        affordableGasCosts.set(erc20.token, gasCostAmount);
      }
    }

    return {
      relayerAddress,
      gasCosts: affordableGasCosts,
    };
  }

  private async fetchAutoWithdrawData(
    bridgeAddress: Address
  ): Promise<AutoWithdrawData> {
    const url = new URL(this.serviceUrl);
    url.searchParams.set("bridge", bridgeAddress.toLowerCase());
    url.searchParams.set("timestamp", String(Math.floor(this.now() / 1000)));

    const response = await this.fetchFn(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    const body: unknown = await response.json();

    if (!response.ok) {
      const message =
        typeof body === "object" &&
        body !== null &&
        "message" in body &&
        typeof (body as Record<string, unknown>).message === "string"
          ? (body as Record<string, unknown>).message
          : `Auto-withdraw gas cost request failed: ${response.status} ${response.statusText}`;
      throw new Error(message as string);
    }

    const { gasCost, relayerAddress } = (
      body as {
        result: {
          gasCost: Record<string, string>;
          relayerAddress: string;
        };
      }
    ).result;

    return {
      relayerAddress: fromAddress(relayerAddress),
      gasCosts: new Map(
        Object.entries(gasCost).map(([address, cost]) => [
          fromAddress(address),
          BigInt(cost),
        ])
      ),
    };
  }
}
