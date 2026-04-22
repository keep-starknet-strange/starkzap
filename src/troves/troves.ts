import type { Call } from "starknet";
import {
  Amount,
  fromAddress,
  type Address,
  type ChainId,
  type ExecuteOptions,
} from "@/types";
import type { Tx } from "@/tx";
import type {
  TrovesStrategyAPIResult,
  TrovesStrategiesResponse,
  TrovesStatsResponse,
  TrovesDepositCallsResponse,
  TrovesDepositToken,
  TrovesContract,
  TrovesRawCall,
  TrovesCallParams,
  TrovesDepositParams,
  TrovesWithdrawParams,
  TrovesPosition,
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

/**
 * Wire-format shape for strategies returned by the Troves API. Kept
 * module-private because it uses the upstream's singular-array field
 * names (`depositToken`, `contract`); the public `TrovesStrategyAPIResult`
 * exposes these as `depositTokens` / `contracts`.
 */
interface TrovesStrategyRaw extends Omit<
  TrovesStrategyAPIResult,
  "apy" | "depositTokens" | "contracts"
> {
  apy: number | string;
  depositToken: TrovesDepositToken[];
  contract: TrovesContract[];
}

interface TrovesStrategiesResponseRaw extends Omit<
  TrovesStrategiesResponse,
  "strategies"
> {
  strategies: TrovesStrategyRaw[];
}

function normalizeApy(value: number | string): number | string {
  if (typeof value === "number") return value;
  // Number("") returns 0; bail out early so we don't silently coerce empty to zero.
  if (value === "") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}

function normalizeTrovesStrategiesResponse(
  data: TrovesStrategiesResponseRaw
): TrovesStrategiesResponse {
  return {
    ...data,
    strategies: data.strategies.map(
      ({ apy, depositToken, contract, ...rest }) => ({
        ...rest,
        apy: normalizeApy(apy),
        depositTokens: depositToken.map((t) => ({
          ...t,
          address: fromAddress(t.address),
        })),
        contracts: contract.map((c) => ({
          ...c,
          address: fromAddress(c.address),
        })),
      })
    ),
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
  data: TrovesStrategiesResponseRaw
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
    "address" | "execute" | "getChainId" | "callContract"
  >;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  private readonly apiBase: string;

  constructor(
    wallet: Pick<
      WalletInterface,
      "address" | "execute" | "getChainId" | "callContract"
    >,
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
    try {
      const res = await this.fetcher(`${this.apiBase}${path}`, {
        ...init,
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(
          `Troves API failed: ${res.status} ${res.statusText} - ${path}`
        );
      }
      return (await res.json()) as T;
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
  }

  async getStrategies(options?: {
    noCache?: boolean;
  }): Promise<TrovesStrategiesResponse> {
    const path = options?.noCache
      ? "/api/strategies?no_cache=true"
      : "/api/strategies";
    const data = await this.fetchJson<TrovesStrategiesResponseRaw>(path);
    validateStrategiesDiscontinuationDates(data);
    return normalizeTrovesStrategiesResponse(data);
  }

  async getStats(): Promise<TrovesStatsResponse> {
    return this.fetchJson<TrovesStatsResponse>("/api/stats");
  }

  /**
   * Get the wallet's position in a Troves strategy.
   *
   * Reads on-chain via two view calls on the strategy's `Vault` contract:
   * `balance_of` for the share count, then `convert_to_assets` to express
   * the holding in its underlying tokens. The SDK infers single- vs
   * dual-asset layout from `strategy.depositTokens.length`.
   *
   * Returns `null` when the wallet holds no shares, or when the strategy
   * has no readable vault contract (e.g. accumulator / TVA strategies).
   *
   * @throws Error if the strategy id is unknown
   *
   * @example
   * ```ts
   * const pos = await wallet.troves().getPosition("ekubo_cl_strketh");
   * if (pos) {
   *   console.log(`shares: ${pos.shares}`);
   *   pos.amounts.forEach((a) => console.log(a.toFormatted()));
   * }
   * ```
   */
  async getPosition(
    strategyId: string,
    address?: Address
  ): Promise<TrovesPosition | null> {
    const { strategies } = await this.getStrategies();
    const strategy = strategies.find((s) => s.id === strategyId);
    if (!strategy) {
      throw new Error(`Troves strategy "${strategyId}" not found`);
    }

    const vault = strategy.contracts.find((c) => c.name === "Vault");
    if (!vault) return null;

    const owner = address ?? this.wallet.address;

    const balanceResult = await this.wallet.callContract({
      contractAddress: vault.address,
      entrypoint: "balance_of",
      calldata: [owner],
    });
    const shares = parseU256(balanceResult, 0);
    if (shares === 0n) return null;

    const convertResult = await this.wallet.callContract({
      contractAddress: vault.address,
      entrypoint: "convert_to_assets",
      calldata: u256ToCalldata(shares),
    });

    const tokens = strategy.depositTokens;
    const isDualAsset = tokens.length === 2;
    // Dual-asset vaults return `MyPosition { liquidity, amount0, amount1 }` —
    // skip the leading liquidity u256 and read the two asset amounts that follow.
    const amounts: Amount[] = isDualAsset
      ? [
          Amount.fromRaw(parseU256(convertResult, 2), tokens[0]!),
          Amount.fromRaw(parseU256(convertResult, 4), tokens[1]!),
        ]
      : [Amount.fromRaw(parseU256(convertResult, 0), tokens[0]!)];

    return {
      strategyId,
      vaultAddress: vault.address,
      shares,
      amounts,
    };
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

  /**
   * Returns the deposit calls for an `Amount`-typed request without executing.
   *
   * Used by `wallet.tx().trovesDeposit(...)` to compose a Troves deposit
   * into a larger atomic transaction. Use `deposit()` to execute directly.
   */
  async populateDeposit(params: TrovesDepositParams): Promise<Call[]> {
    return this.populateDepositCalls(toCallParams(params));
  }

  /**
   * Returns the withdraw calls for an `Amount`-typed request without executing.
   *
   * Used by `wallet.tx().trovesWithdraw(...)` to compose a Troves withdraw
   * into a larger atomic transaction. Use `withdraw()` to execute directly.
   */
  async populateWithdraw(params: TrovesWithdrawParams): Promise<Call[]> {
    return this.populateWithdrawCalls(toCallParams(params));
  }

  async deposit(
    params: TrovesDepositParams,
    options?: ExecuteOptions
  ): Promise<Tx> {
    return this.wallet.execute(await this.populateDeposit(params), options);
  }

  async withdraw(
    params: TrovesWithdrawParams,
    options?: ExecuteOptions
  ): Promise<Tx> {
    return this.wallet.execute(await this.populateWithdraw(params), options);
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

const U128_MASK = (1n << 128n) - 1n;

function parseU256(felts: string[], offset: number): bigint {
  const low = felts[offset];
  const high = felts[offset + 1];
  if (low === undefined || high === undefined) {
    throw new Error(
      `Troves vault returned a truncated u256 (expected 2 felts at offset ${offset}, got ${felts.length - offset})`
    );
  }
  return BigInt(low) | (BigInt(high) << 128n);
}

function u256ToCalldata(value: bigint): string[] {
  return [(value & U128_MASK).toString(), (value >> 128n).toString()];
}
