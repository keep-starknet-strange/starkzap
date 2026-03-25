import type { ContractTransaction } from "ethers";
import { getAddress, Interface } from "ethers";
import { type EthereumAddress, ExternalChain } from "@/types";
import type { Address, Amount } from "@/types";
import { fromEthereumAddress } from "@/connect/ethersRuntime";

const LAYERZERO_API_BASE = "https://transfer.layerzero-api.com/v1";

export interface LayerZeroQuoteFee {
  chainKey: string;
  type: string;
  description: string;
  amount: string;
  address: string;
}

export interface LayerZeroUserStep {
  type: string;
  description: string;
  chainKey: string;
  chainType: string;
  signerAddress: string;
  transaction: { encoded: ContractTransaction };
}

export interface LayerZeroQuote {
  id: string;
  routeSteps: {
    type: string;
    srcChainKey: string;
    description: string;
    duration: { estimated: string | null };
    fees: LayerZeroQuoteFee[];
  }[];
  fees: LayerZeroQuoteFee[];
  duration: { estimated: string | null };
  feeUsd: string;
  feePercent: string;
  srcAmount: string;
  dstAmount: string;
  dstAmountMin: string;
  srcAmountUsd: string;
  dstAmountUsd: string;
  userSteps: LayerZeroUserStep[];
  options: { dstNativeDropAmount: string };
  expiresAt: string;
}

interface LayerZeroApiConfig {
  externalTokenAddress: string;
  starknetTokenAddress: Address;
  externalChainKey: ExternalChain;
  apiKey: string;
}

interface QuoteRequestParams {
  srcWalletAddress: string;
  dstWalletAddress: string;
  amount: Amount;
}

export class LayerZeroApi {
  private readonly fetcher: typeof fetch;

  constructor(
    private readonly config: LayerZeroApiConfig,
    fetcher?: typeof fetch
  ) {
    if (fetcher) {
      this.fetcher = fetcher;
    } else if (typeof globalThis.fetch === "function") {
      this.fetcher = globalThis.fetch.bind(globalThis) as typeof fetch;
    } else {
      throw new Error(
        "No fetch implementation available. Provide fetcher in LayerZeroApi."
      );
    }
  }

  async getDepositQuotes(
    params: QuoteRequestParams
  ): Promise<LayerZeroQuote[]> {
    return this.getQuotes({
      srcChainKey: this.config.externalChainKey,
      srcTokenAddress: this.config.externalTokenAddress,
      dstChainKey: "starknet",
      dstTokenAddress: this.config.starknetTokenAddress,
      ...params,
    });
  }

  getApprovalTransaction(quotes: LayerZeroQuote[]): ContractTransaction | null {
    return this.extractUserStep(quotes, "approve");
  }

  getDepositTransaction(quotes: LayerZeroQuote[]): ContractTransaction | null {
    return this.extractUserStep(quotes, "bridge");
  }

  /**
   * Extract the allowance spender from an approval transaction's calldata.
   * Parses `approve(address,uint256)` to retrieve the spender argument.
   */
  extractSpenderFromApprovalTx(
    approvalTx: ContractTransaction | null
  ): EthereumAddress | null {
    if (!approvalTx?.data) return null;
    try {
      const approveInterface = new Interface([
        "function approve(address spender, uint256 value)",
      ]);
      const decoded = approveInterface.parseTransaction({
        data: approvalTx.data,
      });
      const spender = decoded?.args[0] as string | undefined;
      return spender ? fromEthereumAddress(spender, { getAddress }) : null;
    } catch {
      return null;
    }
  }

  private async getQuotes(params: {
    srcChainKey: string;
    srcTokenAddress: string;
    srcWalletAddress: string;
    dstChainKey: string;
    dstTokenAddress: string;
    dstWalletAddress: string;
    amount: Amount;
  }): Promise<LayerZeroQuote[]> {
    const response = await this.fetcher(`${LAYERZERO_API_BASE}/quotes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.config.apiKey ? { "x-api-key": this.config.apiKey } : {}),
      },
      body: JSON.stringify({
        ...params,
        amount: params.amount.toBase().toString(),
        options: {
          amountType: "EXACT_SRC_AMOUNT",
          feeTolerance: { type: "PERCENT", amount: 1 },
          dstNativeDropAmount: "0",
        },
      }),
    });

    if (!response.ok) {
      throw new Error(
        `LayerZero API request failed (${response.status}): ${await response.text()}`
      );
    }

    const data = (await response.json()) as { quotes: LayerZeroQuote[] };
    return data.quotes;
  }

  private extractUserStep(
    quotes: LayerZeroQuote[],
    description: string
  ): ContractTransaction | null {
    const quote = quotes[0];
    if (!quote) return null;
    try {
      const step = quote.userSteps.find((s) => s.description === description);
      return step?.transaction.encoded ?? null;
    } catch {
      return null;
    }
  }
}
