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
import { type RpcProvider } from "starknet";

export interface AutoWithdrawFeesHandlerOptions {
  chainId: ChainId;
  provider: RpcProvider;
  fetchFn?: typeof fetch;
  now?: () => number;
}

/** Arguments for {@link AutoWithdrawFeesHandler.getFeeData}. */
export interface AutoWithdrawFeeInput {
  /** L2 bridge token involved in the withdrawal (used for bridge address and balance rules). */
  bridgeToken: BridgeToken;
  /** Withdrawal amount; reserved from balance when the fee token is the bridged token. */
  amount: Amount;
  /** Wallet or account whose balances are checked against quoted gas costs. */
  walletOrAddress: WalletInterface | Address;
  /**
   * If set, selects this token when it is among affordable tokens; otherwise the first
   * affordable token (per service ordering) is used.
   */
  preferredFeeToken: Token | undefined;
}

/** Result of {@link AutoWithdrawFeesHandler.getFeeData}. */
export interface AutoWithdrawFeeOutput {
  /** Relayer address returned by the gas-cost service (transfer recipient for the fee). */
  relayerAddress: Address;
  /** Token and amount chosen to pay the auto-withdraw gas obligation. */
  preselectedGasToken: {
    tokenAddress: Address;
    cost: Amount;
  };
  /** All fee tokens the wallet can currently afford for this withdrawal, mapped to quoted cost. */
  costsPerToken: Map<Token, Amount>;
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

  /**
   * Fetches StarkGate auto-withdraw gas quotes and picks a payable fee token for the wallet.
   *
   * Compares the wallet balance to the quoted gas cost. A token is **affordable** if effective
   * balance ≥ gas cost.
   *
   * When the fee token is the same as the token being withdrawn, `amount` is treated as
   * already committed to the withdrawal. So affordability is calculated by deducting the
   * withdrawal amount.
   *
   * **Selection:** If `preferredFeeToken` is affordable, it becomes `preselectedGasToken`;
   * otherwise the first affordable token in service iteration order is used. If no token is
   * affordable, throws a clear error (no partial/empty success).
   *
   * @param input - Bridge context, withdrawal size, balance holder, and optional fee preference.
   * @returns Relayer address, chosen gas token + cost, and the full map of affordable options.
   * @throws {Error} When the HTTP response is not OK (message from body when present), or when
   *   no wallet token can cover auto-withdraw (`"The user has no sufficient balance…"`).
   */
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
      if (isFeeTokenTheBridgedToken && balance.lt(input.amount)) continue;

      const effectiveBalance = isFeeTokenTheBridgedToken
        ? balance.subtract(input.amount)
        : balance;

      if (effectiveBalance.gte(gasCostAmount)) {
        affordableGasCosts.set(erc20.token, gasCostAmount);
      }
    }

    const affordableEntries = [...affordableGasCosts.entries()];
    const firstAffordable = affordableEntries[0];

    if (!firstAffordable) {
      throw new Error(
        "The user has no sufficient balance to cover for auto-withdraw."
      );
    }

    const preferredFeeToken = input.preferredFeeToken;
    const preselectedToken = preferredFeeToken
      ? (affordableEntries.find(
          ([t]) => t.address === preferredFeeToken.address
        ) ?? firstAffordable)
      : firstAffordable;

    return {
      relayerAddress,
      preselectedGasToken: {
        tokenAddress: preselectedToken[0].address,
        cost: preselectedToken[1],
      },
      costsPerToken: affordableGasCosts,
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
      signal: AbortSignal.timeout(10_000),
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
