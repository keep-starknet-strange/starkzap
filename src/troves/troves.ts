import type { Call } from "starknet";
import { fromAddress, type ExecuteOptions } from "@/types";
import type { Tx } from "@/tx";
import type {
  TrovesStrategiesResponse,
  TrovesStatsResponse,
  TrovesDepositCallsResponse,
  TrovesRawCall,
  TrovesCallParams,
} from "@/troves/types";
import type { WalletInterface } from "@/wallet/interface";

const TROVES_API_BASE = "https://app.troves.fi";

export interface TrovesOptions {
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

function normalizeTrovesStrategiesResponse(
  data: TrovesStrategiesResponse
): TrovesStrategiesResponse {
  return {
    ...data,
    strategies: data.strategies.map((s) => ({
      ...s,
      depositToken: s.depositToken.map((t) => ({
        ...t,
        address: fromAddress(t.address),
      })),
      contract: s.contract.map((c) => ({
        ...c,
        address: fromAddress(c.address),
      })),
    })),
  };
}

function normalizeTrovesDepositCallsResponse(
  data: TrovesDepositCallsResponse
): TrovesDepositCallsResponse {
  return {
    ...data,
    results: data.results.map((r) => ({
      ...r,
      tokenInfo: {
        ...r.tokenInfo,
        address: fromAddress(r.tokenInfo.address),
      },
      calls: r.calls.map((c) => ({
        ...c,
        contractAddress: fromAddress(c.contractAddress),
      })),
    })),
  };
}

function validateStrategiesDiscontinuationDates(
  data: TrovesStrategiesResponse
): void {
  for (const s of data.strategies) {
    const raw = s.discontinuationInfo?.date;
    if (raw === undefined || raw === null) continue;
    if (typeof raw !== "string") {
      throw new Error(
        `Troves API returned invalid discontinuationInfo.date type for strategy "${s.id}"`
      );
    }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(
        `Troves API returned invalid discontinuationInfo.date for strategy "${s.id}"`
      );
    }
  }
}

function normalizeCalldata(raw: TrovesRawCall): Call {
  const calldata = raw.calldata.map((v) => {
    if (typeof v === "boolean") return v ? "1" : "0";
    return String(v);
  });
  return {
    contractAddress: raw.contractAddress,
    entrypoint: raw.entrypoint,
    calldata,
  };
}

/**
 * Troves module for interacting with Troves DeFi strategies via StarkZap.
 *
 * Read operations (getStrategies, getStats) use Troves HTTP APIs.
 * Write operations (deposit, withdraw) call the Troves deposit/withdraw API to get
 * transaction calls, then execute them via wallet.execute().
 *
 * @example
 * ```ts
 * const wallet = await sdk.connectWallet({ account: { signer } });
 * const troves = new Troves(wallet);
 *
 * const strategies = await troves.getStrategies();
 * const stats = await troves.getStats();
 * const tx = await troves.deposit(
 *   { strategyId: "evergreen_strk", amountRaw: "1000000000000000000" },
 *   {}
 * );
 * ```
 */
export class Troves {
  private readonly wallet: Pick<WalletInterface, "address" | "execute">;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;

  constructor(
    wallet: Pick<WalletInterface, "address" | "execute">,
    options?: TrovesOptions
  ) {
    this.wallet = wallet;
    this.fetcher =
      options?.fetcher ??
      ((url: RequestInfo | URL, init?: RequestInit) => fetch(url, init));
    this.timeoutMs = options?.timeoutMs ?? 15000;
  }

  private async fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetcher(`${TROVES_API_BASE}${path}`, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      const name =
        error && typeof error === "object" && "name" in error
          ? String((error as { name?: unknown }).name)
          : "";
      if (name === "AbortError") {
        throw new Error(
          `Troves API request to ${path} timed out after ${this.timeoutMs}ms`
        );
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      throw new Error(
        `Troves API failed: ${res.status} ${res.statusText} - ${path}`
      );
    }
    return res.json() as Promise<T>;
  }

  async getStrategies(options?: {
    noCache?: boolean;
  }): Promise<TrovesStrategiesResponse> {
    const path = options?.noCache
      ? "/api/strategies?no_cache=true"
      : "/api/strategies";
    const data = await this.fetchJson<TrovesStrategiesResponse>(path);
    validateStrategiesDiscontinuationDates(data);
    return normalizeTrovesStrategiesResponse(data);
  }

  async getStats(): Promise<TrovesStatsResponse> {
    return this.fetchJson<TrovesStatsResponse>("/api/stats");
  }

  private async populateCalls(
    params: TrovesCallParams,
    isDeposit: boolean
  ): Promise<Call[]> {
    const address = params.address ?? String(this.wallet.address);
    const body = {
      strategyId: params.strategyId,
      amountRaw: params.amountRaw,
      amount2Raw: params.amount2Raw,
      isDeposit,
      address,
    };
    const data = normalizeTrovesDepositCallsResponse(
      await this.fetchJson<TrovesDepositCallsResponse>("/api/deposits/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    );
    if (!data.success || !data.results?.length) {
      const op = isDeposit ? "deposit" : "withdraw";
      throw new Error(
        `Troves ${op} API returned no calls for strategy "${params.strategyId}"`
      );
    }
    const calls: Call[] = [];
    for (const result of data.results) {
      for (const raw of result.calls) {
        calls.push(normalizeCalldata(raw));
      }
    }
    if (calls.length === 0) {
      const op = isDeposit ? "deposit" : "withdraw";
      throw new Error(
        `Troves ${op} API returned results with no calls for strategy "${params.strategyId}"`
      );
    }
    return calls;
  }

  async populateDepositCalls(params: TrovesCallParams): Promise<Call[]> {
    return this.populateCalls(params, true);
  }

  async populateWithdrawCalls(params: TrovesCallParams): Promise<Call[]> {
    return this.populateCalls(params, false);
  }

  async deposit(
    params: {
      strategyId: string;
      amountRaw: string;
      amount2Raw?: string;
    },
    options?: ExecuteOptions
  ): Promise<Tx> {
    const calls = await this.populateDepositCalls(params);
    return this.wallet.execute(calls, options);
  }

  async withdraw(
    params: {
      strategyId: string;
      amountRaw: string;
      amount2Raw?: string;
    },
    options?: ExecuteOptions
  ): Promise<Tx> {
    const calls = await this.populateWithdrawCalls(params);
    return this.wallet.execute(calls, options);
  }
}
