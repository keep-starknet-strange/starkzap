import type { Call } from "starknet";
import { fromAddress, type ChainId, type ExecuteOptions } from "@/types";
import type { Tx } from "@/tx";
import type {
  TrovesStrategiesResponse,
  TrovesStatsResponse,
  TrovesDepositCallsResponse,
  TrovesRawCall,
  TrovesCallParams,
  TrovesDepositParams,
} from "@/troves/types";
import type { WalletInterface } from "@/wallet/interface";
import { assertSafeHttpUrl } from "@/utils";

const TROVES_API_BASE_DEFAULT = "https://app.troves.fi";

export interface TrovesOptions {
  fetcher?: typeof fetch;
  timeoutMs?: number;
  /**
   * Override the Troves API base URL.
   *
   * Required to use Troves on a non-mainnet chain — the SDK throws on
   * Sepolia by default since Troves is a mainnet-only service.
   */
  apiBase?: string;
}

function resolveApiBase(
  chainId: ChainId,
  override: string | undefined
): string {
  if (override !== undefined) {
    return assertSafeHttpUrl(override, "TrovesOptions.apiBase")
      .toString()
      .replace(/\/+$/, "");
  }
  if (!chainId.isMainnet()) {
    throw new Error(
      `Troves only supports Starknet Mainnet. Current chain is "${chainId.toLiteral()}". ` +
        `Pass TrovesOptions.apiBase to override (e.g. for a custom backend).`
    );
  }
  return TROVES_API_BASE_DEFAULT;
}

function normalizeApy(value: number | string): number | string {
  if (typeof value === "number") return value;
  // Number("") returns 0; bail out early so we don't silently coerce empty to zero.
  if (value === "") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}

function normalizeTrovesStrategiesResponse(
  data: TrovesStrategiesResponse
): TrovesStrategiesResponse {
  return {
    ...data,
    strategies: data.strategies.map((s) => ({
      ...s,
      apy: normalizeApy(s.apy),
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
 * const tx = await troves.deposit({
 *   strategyId: "evergreen_strk",
 *   amount: Amount.parse("1", STRK),
 * });
 * ```
 */
export class Troves {
  private readonly wallet: Pick<
    WalletInterface,
    "address" | "execute" | "getChainId"
  >;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  private readonly apiBase: string;

  constructor(
    wallet: Pick<WalletInterface, "address" | "execute" | "getChainId">,
    options?: TrovesOptions
  ) {
    this.wallet = wallet;
    this.fetcher =
      options?.fetcher ??
      ((url: RequestInfo | URL, init?: RequestInit) => fetch(url, init));
    this.timeoutMs = options?.timeoutMs ?? 15000;
    this.apiBase = resolveApiBase(wallet.getChainId(), options?.apiBase);
  }

  private async fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetcher(`${this.apiBase}${path}`, {
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
    const address = params.address ?? this.wallet.address;
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

  /**
   * Returns the deposit calls without executing — kept separate from `deposit()`
   * so callers can compose them atomically with other calls.
   */
  async populateDepositCalls(params: TrovesCallParams): Promise<Call[]> {
    return this.populateCalls(params, true);
  }

  /**
   * Returns the withdraw calls without executing — kept separate from `withdraw()`
   * so callers can compose them atomically with other calls.
   */
  async populateWithdrawCalls(params: TrovesCallParams): Promise<Call[]> {
    return this.populateCalls(params, false);
  }

  async deposit(
    params: TrovesDepositParams,
    options?: ExecuteOptions
  ): Promise<Tx> {
    const calls = await this.populateDepositCalls(toCallParams(params));
    return this.wallet.execute(calls, options);
  }

  async withdraw(
    params: TrovesDepositParams,
    options?: ExecuteOptions
  ): Promise<Tx> {
    const calls = await this.populateWithdrawCalls(toCallParams(params));
    return this.wallet.execute(calls, options);
  }
}

function toCallParams(params: TrovesDepositParams): TrovesCallParams {
  const callParams: TrovesCallParams = {
    strategyId: params.strategyId,
    amountRaw: params.amount.toBase().toString(),
  };
  if (params.amount2 !== undefined) {
    callParams.amount2Raw = params.amount2.toBase().toString();
  }
  return callParams;
}
