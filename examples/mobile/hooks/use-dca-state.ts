import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Amount,
  DCA_CONTINUOUS_FREQUENCY,
  type ChainId,
  type DcaOrder,
  type PreparedDcaAction,
  type DcaProvider,
  type SwapProvider,
  type Token,
  type Tx,
  type WalletInterface,
} from "starkzap";
import {
  showTransactionToast,
  updateTransactionToast,
} from "@/components/Toast";
import { getSwapProviderLabel } from "@/swaps";

const DCA_ORDER_PAGE_SIZE = 6;

export const DCA_FREQUENCY_OPTIONS = [
  { value: "PT1H", label: "1h" },
  { value: "PT12H", label: "12h" },
  { value: "P1D", label: "Daily" },
  { value: "P3D", label: "3d" },
  { value: "P1W", label: "Weekly" },
] as const;

export type DcaFrequencyValue = (typeof DCA_FREQUENCY_OPTIONS)[number]["value"];

export interface DcaPreviewState {
  amountOutBase: bigint;
  priceImpactBps?: bigint | null;
  providerId: string;
  routeCallCount?: number;
}

function describeDcaError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const parts = [error.message];
  if ("cause" in error && error.cause != null) {
    parts.push(`cause=${String(error.cause)}`);
  }

  return parts.join(" | ");
}

function summarizeDcaStatuses(orders: readonly DcaOrder[]): string {
  const counts = new Map<string, number>();

  for (const order of orders) {
    counts.set(order.status, (counts.get(order.status) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([status, count]) => `${status}:${count}`)
    .join(", ");
}

function describeLatestDcaOrder(order: DcaOrder): string {
  const nextPendingTrade = order.trades.find(
    (trade) => trade.status === "PENDING"
  );
  const nextTrade = nextPendingTrade?.expectedTradeDate.toISOString();

  return [
    `${order.status} ${cropAddress(order.orderAddress)}`,
    `start=${order.startDate.toISOString()}`,
    `executed=${order.executedTradesCount}`,
    `pending=${order.pendingTradesCount}`,
    nextTrade ? `next=${nextTrade}` : null,
  ]
    .filter((part): part is string => part != null)
    .join(" | ");
}

function getPreferredDcaPreviewProviderId(
  providers: readonly SwapProvider[]
): string | null {
  if (!providers.length) {
    return null;
  }
  return (
    providers.find((provider) => provider.id === "ekubo")?.id ??
    providers[0]!.id
  );
}

function getPreferredDcaProviderId(
  providers: readonly DcaProvider[]
): string | null {
  if (!providers.length) {
    return null;
  }
  return (
    providers.find((provider) => provider.id === "avnu")?.id ?? providers[0]!.id
  );
}

export function getDcaProviderLabel(providerId: string): string {
  return providerId.toUpperCase();
}

export function getCuratedDcaTokens(
  tokens: readonly Token[],
  chainId: ChainId
): Token[] {
  const preferredSymbols =
    chainId.toLiteral() === "SN_SEPOLIA"
      ? ["STRK", "USDC.e", "USDC", "ETH", "WBTC"]
      : ["STRK", "USDC", "USDT", "DAI", "ETH", "WBTC"];

  const selected: Token[] = [];
  for (const symbol of preferredSymbols) {
    const token = tokens.find((item) => item.symbol === symbol);
    if (
      token &&
      !selected.some((current) => current.address === token.address)
    ) {
      selected.push(token);
    }
  }

  if (selected.length >= 2) {
    return selected;
  }

  return tokens.slice(0, Math.min(tokens.length, 6));
}

export function getDefaultDcaPair(
  tokens: readonly Token[],
  chainId: ChainId
): { buyToken: Token; sellToken: Token } {
  const fallback = tokens[0];
  if (!fallback) {
    throw new Error("No DCA tokens available for this network");
  }

  const sellToken = tokens.find((token) => token.symbol === "STRK") ?? fallback;
  const preferredOutputSymbols =
    chainId.toLiteral() === "SN_SEPOLIA"
      ? ["USDC.e", "USDC", "ETH"]
      : ["USDC", "USDT", "DAI", "ETH"];

  for (const symbol of preferredOutputSymbols) {
    const buyToken = tokens.find((token) => token.symbol === symbol);
    if (buyToken && buyToken.address !== sellToken.address) {
      return { buyToken, sellToken };
    }
  }

  const buyToken =
    tokens.find((token) => token.address !== sellToken.address) ?? sellToken;
  return { buyToken, sellToken };
}

export function getDcaFrequencyLabel(frequency: string): string {
  if (frequency === DCA_CONTINUOUS_FREQUENCY) {
    return "Continuous";
  }
  return (
    DCA_FREQUENCY_OPTIONS.find((option) => option.value === frequency)?.label ??
    frequency
  );
}

export function formatDateStamp(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatTokenAmount(
  amountBase: bigint,
  token: Token | null
): string {
  if (!token) {
    return amountBase.toString();
  }
  return Amount.fromRaw(amountBase, token.decimals, token.symbol).toFormatted(
    true
  );
}

export function buildDcaCancelInput(order: DcaOrder) {
  return order.providerId === "ekubo"
    ? { provider: order.providerId, orderId: order.id }
    : { provider: order.providerId, orderAddress: order.orderAddress };
}

export function cropAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 5)}...${addr.slice(-5)}`;
}

export function getExplorerUrl(txHash: string, chainId: ChainId): string {
  const baseUrl =
    chainId.toLiteral() === "SN_SEPOLIA"
      ? "https://sepolia.voyager.online/tx"
      : "https://voyager.online/tx";
  return `${baseUrl}/${txHash}`;
}

export interface UseDcaStateDeps {
  wallet: WalletInterface | null;
  chainId: ChainId;
  addLog: (message: string) => void;
  fetchBalances: (wallet: WalletInterface, chainId: ChainId) => Promise<void>;
  getBalance: (token: Token) => Amount | null;
  availableIntegrations: readonly SwapProvider[];
  availableDcaProviders: readonly DcaProvider[];
  dcaTokens: Token[];
  dcaDefaultPair: { buyToken: Token; sellToken: Token };
  useSponsored: boolean;
  canUseSponsored: boolean;
  screenMode: "swap" | "dca";
}

export interface UseDcaStateReturn {
  // State
  selectedDcaProviderId: string | null;
  selectedDcaPreviewProviderId: string | null;
  dcaSellToken: Token;
  dcaBuyToken: Token;
  dcaTotalAmount: string;
  dcaCycleAmount: string;
  dcaFrequency: DcaFrequencyValue;
  dcaPreview: DcaPreviewState | null;
  dcaError: string | null;
  dcaOrdersError: string | null;
  dcaOrders: DcaOrder[];
  isDcaPreviewing: boolean;
  isDcaSubmitting: boolean;
  isRefreshingDcaOrders: boolean;
  cancellingDcaOrderId: string | null;

  // Computed
  canPreviewDca: boolean;
  canCreateDca: boolean;
  dcaExceedsBalance: boolean;
  dcaSameToken: boolean;
  dcaCycleExceedsTotal: boolean;
  parsedDcaTotalAmount: Amount | null;
  parsedDcaCycleAmount: Amount | null;
  dcaTotalAmountError: string | null;
  dcaCycleAmountError: string | null;
  dcaPreviewProviderLabel: string | null;
  dcaBackendLabel: string | null;
  dcaSellBalance: Amount | null;

  // Resolved providers
  selectedDcaProvider: DcaProvider | null;
  selectedDcaPreviewProvider: SwapProvider | null;

  // Handlers
  handleSelectDcaProvider: (providerId: string) => void;
  handleSelectDcaPreviewProvider: (integrationId: string) => void;
  handleSelectDcaSellToken: (token: Token) => void;
  handleSelectDcaBuyToken: (token: Token) => void;
  handleSelectDcaFrequency: (value: DcaFrequencyValue) => void;
  handlePreviewDca: () => Promise<void>;
  handleCreateDca: () => Promise<void>;
  handleCancelDcaOrder: (order: DcaOrder) => Promise<void>;
  handleFlipDcaTokens: () => void;
  handleDcaTotalAmountChange: (value: string) => void;
  handleDcaCycleAmountChange: (value: string) => void;
  refreshDcaOrders: (silent?: boolean) => Promise<void>;
}

export function useDcaState(deps: UseDcaStateDeps): UseDcaStateReturn {
  const {
    wallet,
    chainId,
    addLog,
    fetchBalances,
    getBalance,
    availableIntegrations,
    availableDcaProviders,
    dcaTokens,
    dcaDefaultPair,
    useSponsored,
    canUseSponsored,
    screenMode,
  } = deps;

  const [selectedDcaProviderId, setSelectedDcaProviderId] = useState<
    string | null
  >(null);
  const [selectedDcaPreviewProviderId, setSelectedDcaPreviewProviderId] =
    useState<string | null>(null);
  const [dcaSellToken, setDcaSellToken] = useState<Token>(
    dcaDefaultPair.sellToken
  );
  const [dcaBuyToken, setDcaBuyToken] = useState<Token>(
    dcaDefaultPair.buyToken
  );
  const [dcaTotalAmount, setDcaTotalAmount] = useState("");
  const [dcaCycleAmount, setDcaCycleAmount] = useState("");
  const [dcaFrequency, setDcaFrequency] = useState<DcaFrequencyValue>("P1D");
  const [dcaPreview, setDcaPreview] = useState<DcaPreviewState | null>(null);
  const [dcaError, setDcaError] = useState<string | null>(null);
  const [dcaOrdersError, setDcaOrdersError] = useState<string | null>(null);
  const [dcaOrders, setDcaOrders] = useState<DcaOrder[]>([]);
  const [isDcaPreviewing, setIsDcaPreviewing] = useState(false);
  const [isDcaSubmitting, setIsDcaSubmitting] = useState(false);
  const [isRefreshingDcaOrders, setIsRefreshingDcaOrders] = useState(false);
  const [cancellingDcaOrderId, setCancellingDcaOrderId] = useState<
    string | null
  >(null);
  const dcaOrdersRequestId = useRef(0);

  const clearDcaTransientState = useCallback(() => {
    setDcaPreview(null);
    setDcaError(null);
  }, []);

  // Sync DCA provider selection
  useEffect(() => {
    if (!availableDcaProviders.length) {
      setSelectedDcaProviderId(null);
      return;
    }

    if (
      !selectedDcaProviderId ||
      !availableDcaProviders.some(
        (provider) => provider.id === selectedDcaProviderId
      )
    ) {
      setSelectedDcaProviderId(
        getPreferredDcaProviderId(availableDcaProviders)
      );
    }
  }, [availableDcaProviders, selectedDcaProviderId]);

  // Sync DCA preview provider selection
  useEffect(() => {
    const preferredPreviewProviderId = getPreferredDcaPreviewProviderId(
      availableIntegrations
    );
    if (!preferredPreviewProviderId) {
      setSelectedDcaPreviewProviderId(null);
      return;
    }

    if (
      !selectedDcaPreviewProviderId ||
      !availableIntegrations.some(
        (integration) => integration.id === selectedDcaPreviewProviderId
      )
    ) {
      setSelectedDcaPreviewProviderId(preferredPreviewProviderId);
    }
  }, [availableIntegrations, selectedDcaPreviewProviderId]);

  // Sync DCA tokens on chain change
  useEffect(() => {
    if (!dcaTokens.length) {
      return;
    }

    setDcaSellToken((current) => {
      const currentExists = dcaTokens.some(
        (token) => token.address === current.address
      );
      return currentExists ? current : dcaDefaultPair.sellToken;
    });

    setDcaBuyToken((current) => {
      const currentExists = dcaTokens.some(
        (token) => token.address === current.address
      );
      if (
        currentExists &&
        current.address !== dcaDefaultPair.sellToken.address
      ) {
        return current;
      }
      return dcaDefaultPair.buyToken;
    });
  }, [dcaDefaultPair.buyToken, dcaDefaultPair.sellToken, dcaTokens]);

  // Clear transient state when the active chain/provider/session changes.
  useEffect(() => {
    dcaOrdersRequestId.current += 1;
    clearDcaTransientState();
    setDcaOrders([]);
    setDcaOrdersError(null);
    setIsRefreshingDcaOrders(false);
  }, [chainId, clearDcaTransientState, selectedDcaProviderId, wallet]);

  useEffect(() => {
    if (screenMode !== "dca") {
      clearDcaTransientState();
    }
  }, [clearDcaTransientState, screenMode]);

  // Resolved providers
  const selectedDcaPreviewProvider = useMemo<SwapProvider | null>(() => {
    if (!availableIntegrations.length || !selectedDcaPreviewProviderId) {
      return null;
    }
    return (
      availableIntegrations.find(
        (integration) => integration.id === selectedDcaPreviewProviderId
      ) ?? null
    );
  }, [availableIntegrations, selectedDcaPreviewProviderId]);

  const selectedDcaProvider = useMemo<DcaProvider | null>(() => {
    if (!availableDcaProviders.length || !selectedDcaProviderId) {
      return null;
    }
    return (
      availableDcaProviders.find(
        (provider) => provider.id === selectedDcaProviderId
      ) ?? null
    );
  }, [availableDcaProviders, selectedDcaProviderId]);

  // Balance-derived values
  const dcaSellBalance = getBalance(dcaSellToken);
  const dcaTotalAmountNumber = parseFloat(dcaTotalAmount) || 0;
  const dcaSellBalanceNumber = parseFloat(dcaSellBalance?.toUnit() ?? "0") || 0;
  const dcaExceedsBalance =
    dcaTotalAmountNumber > 0 &&
    !!dcaSellBalance &&
    dcaTotalAmountNumber > dcaSellBalanceNumber;
  const dcaSameToken = dcaSellToken.address === dcaBuyToken.address;

  const dcaTotalAmountError = useMemo(() => {
    if (!dcaTotalAmount.trim()) {
      return null;
    }
    try {
      const parsedAmount = Amount.parse(dcaTotalAmount, dcaSellToken);
      if (parsedAmount.toBase() <= 0n) {
        return "Total amount must be greater than zero";
      }
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }, [dcaSellToken, dcaTotalAmount]);

  const parsedDcaTotalAmount = useMemo(() => {
    if (!dcaTotalAmount.trim() || dcaTotalAmountError) {
      return null;
    }
    try {
      return Amount.parse(dcaTotalAmount, dcaSellToken);
    } catch {
      return null;
    }
  }, [dcaSellToken, dcaTotalAmount, dcaTotalAmountError]);

  const dcaCycleAmountError = useMemo(() => {
    if (!dcaCycleAmount.trim()) {
      return null;
    }
    try {
      const parsedAmount = Amount.parse(dcaCycleAmount, dcaSellToken);
      if (parsedAmount.toBase() <= 0n) {
        return "Per-cycle amount must be greater than zero";
      }
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }, [dcaCycleAmount, dcaSellToken]);

  const parsedDcaCycleAmount = useMemo(() => {
    if (!dcaCycleAmount.trim() || dcaCycleAmountError) {
      return null;
    }
    try {
      return Amount.parse(dcaCycleAmount, dcaSellToken);
    } catch {
      return null;
    }
  }, [dcaCycleAmount, dcaCycleAmountError, dcaSellToken]);

  const dcaCycleExceedsTotal =
    !!parsedDcaTotalAmount &&
    !!parsedDcaCycleAmount &&
    parsedDcaCycleAmount.toBase() > parsedDcaTotalAmount.toBase();

  const canPreviewDca =
    !!wallet &&
    !!selectedDcaProvider &&
    !!selectedDcaPreviewProvider &&
    !!parsedDcaCycleAmount &&
    !isDcaPreviewing &&
    !dcaSameToken &&
    !dcaCycleAmountError;

  const canCreateDca =
    !!wallet &&
    !!selectedDcaProvider &&
    !isDcaSubmitting &&
    !!parsedDcaTotalAmount &&
    !!parsedDcaCycleAmount &&
    !dcaSameToken &&
    !dcaExceedsBalance &&
    !dcaCycleExceedsTotal &&
    !dcaTotalAmountError &&
    !dcaCycleAmountError;

  const dcaPreviewProviderLabel = useMemo(() => {
    if (!dcaPreview) {
      return null;
    }

    const matchingProvider = availableIntegrations.find(
      (provider) => provider.id === dcaPreview.providerId
    );
    if (matchingProvider) {
      return getSwapProviderLabel(matchingProvider);
    }

    return dcaPreview.providerId.toUpperCase();
  }, [availableIntegrations, dcaPreview]);

  const dcaBackendLabel = useMemo(() => {
    if (!selectedDcaProvider) {
      return null;
    }
    return getDcaProviderLabel(selectedDcaProvider.id);
  }, [selectedDcaProvider]);

  // Handlers
  const refreshDcaOrders = useCallback(
    async (silent = false) => {
      if (!wallet) {
        return;
      }

      const requestId = ++dcaOrdersRequestId.current;
      const isCurrentRequest = () => dcaOrdersRequestId.current === requestId;

      setIsRefreshingDcaOrders(true);
      if (!silent) {
        setDcaOrdersError(null);
      }

      try {
        if (!selectedDcaProviderId) {
          setDcaOrders([]);
          setDcaOrdersError("Select a DCA backend to load orders");
          return;
        }

        const page = await wallet.dca().getOrders({
          provider: selectedDcaProviderId,
          size: DCA_ORDER_PAGE_SIZE,
        });
        if (!isCurrentRequest()) {
          return;
        }
        setDcaOrders(page.content);
        setDcaOrdersError(null);
        if (!silent) {
          const statusSummary = summarizeDcaStatuses(page.content);
          addLog(
            `Loaded ${page.content.length} ${selectedDcaProviderId.toUpperCase()} DCA orders${statusSummary ? ` (${statusSummary})` : ""}`
          );

          const latestOrder = page.content[0];
          if (latestOrder) {
            addLog(
              `Latest ${selectedDcaProviderId.toUpperCase()} order: ${describeLatestDcaOrder(latestOrder)}`
            );
          }
        }
      } catch (error) {
        if (!isCurrentRequest()) {
          return;
        }
        const message = describeDcaError(error);
        setDcaOrdersError(message);
        addLog(
          `DCA orders refresh failed for ${selectedDcaProviderId?.toUpperCase() ?? "unknown"} on ${chainId.toLiteral()}: ${message}`
        );
      } finally {
        if (isCurrentRequest()) {
          setIsRefreshingDcaOrders(false);
        }
      }
    },
    [addLog, chainId, selectedDcaProviderId, wallet]
  );

  // Auto-refresh orders when on DCA tab
  useEffect(() => {
    if (screenMode !== "dca" || !wallet) {
      return;
    }
    void refreshDcaOrders(true);
  }, [chainId, refreshDcaOrders, screenMode, selectedDcaProviderId, wallet]);

  const handleSelectDcaProvider = useCallback(
    (providerId: string) => {
      setSelectedDcaProviderId(providerId);
      clearDcaTransientState();
    },
    [clearDcaTransientState]
  );

  const handleSelectDcaPreviewProvider = useCallback(
    (integrationId: string) => {
      setSelectedDcaPreviewProviderId(integrationId);
      clearDcaTransientState();
    },
    [clearDcaTransientState]
  );

  const handleSelectDcaSellToken = useCallback(
    (token: Token) => {
      setDcaSellToken(token);
      setDcaBuyToken((current) => {
        if (current.address !== token.address) {
          return current;
        }
        return (
          dcaTokens.find((candidate) => candidate.address !== token.address) ??
          current
        );
      });
      clearDcaTransientState();
    },
    [clearDcaTransientState, dcaTokens]
  );

  const handleSelectDcaBuyToken = useCallback(
    (token: Token) => {
      setDcaBuyToken(token);
      setDcaSellToken((current) => {
        if (current.address !== token.address) {
          return current;
        }
        return (
          dcaTokens.find((candidate) => candidate.address !== token.address) ??
          current
        );
      });
      clearDcaTransientState();
    },
    [clearDcaTransientState, dcaTokens]
  );

  const handleSelectDcaFrequency = useCallback(
    (value: DcaFrequencyValue) => {
      setDcaFrequency(value);
      clearDcaTransientState();
    },
    [clearDcaTransientState]
  );

  const handleFlipDcaTokens = useCallback(() => {
    setDcaSellToken(dcaBuyToken);
    setDcaBuyToken(dcaSellToken);
    clearDcaTransientState();
  }, [clearDcaTransientState, dcaBuyToken, dcaSellToken]);

  const handleDcaTotalAmountChange = useCallback(
    (value: string) => {
      setDcaTotalAmount(value);
      clearDcaTransientState();
    },
    [clearDcaTransientState]
  );

  const handleDcaCycleAmountChange = useCallback(
    (value: string) => {
      setDcaCycleAmount(value);
      clearDcaTransientState();
    },
    [clearDcaTransientState]
  );

  const handlePreviewDca = useCallback(async () => {
    if (!wallet || !parsedDcaCycleAmount || !selectedDcaPreviewProviderId) {
      return;
    }

    setDcaPreview(null);
    setDcaError(null);
    setIsDcaPreviewing(true);

    try {
      addLog(
        `Previewing ${selectedDcaPreviewProviderId.toUpperCase()} DCA cycle ${dcaCycleAmount} ${dcaSellToken.symbol} -> ${dcaBuyToken.symbol}`
      );

      const quote = await wallet.dca().previewCycle({
        buyToken: dcaBuyToken,
        sellAmountPerCycle: parsedDcaCycleAmount,
        sellToken: dcaSellToken,
        swapProvider: selectedDcaPreviewProviderId,
      });

      setDcaPreview({
        amountOutBase: quote.amountOutBase,
        priceImpactBps: quote.priceImpactBps,
        providerId: quote.provider ?? selectedDcaPreviewProviderId,
        routeCallCount: quote.routeCallCount,
      });

      addLog(
        `DCA cycle preview received: ${Amount.fromRaw(
          quote.amountOutBase,
          dcaBuyToken.decimals,
          dcaBuyToken.symbol
        ).toFormatted(true)}`
      );
    } catch (error) {
      const message = describeDcaError(error);
      setDcaError(message);
      addLog(`DCA preview failed: ${message}`);
    } finally {
      setIsDcaPreviewing(false);
    }
  }, [
    addLog,
    dcaBuyToken,
    dcaCycleAmount,
    dcaSellToken,
    parsedDcaCycleAmount,
    selectedDcaPreviewProviderId,
    wallet,
  ]);

  const handleCreateDca = useCallback(async () => {
    if (
      !wallet ||
      !parsedDcaTotalAmount ||
      !parsedDcaCycleAmount ||
      !selectedDcaProviderId
    ) {
      return;
    }

    setDcaError(null);
    setIsDcaSubmitting(true);

    try {
      const wantsSponsored = useSponsored && canUseSponsored;
      const createRequest = {
        provider: selectedDcaProviderId,
        buyToken: dcaBuyToken,
        frequency: dcaFrequency,
        sellAmount: parsedDcaTotalAmount,
        sellAmountPerCycle: parsedDcaCycleAmount,
        sellToken: dcaSellToken,
      };

      addLog(
        `Creating ${selectedDcaProviderId.toUpperCase()} DCA order ${dcaTotalAmount} ${dcaSellToken.symbol} total / ${dcaCycleAmount} per cycle into ${dcaBuyToken.symbol} (${dcaFrequency})`
      );

      addLog(
        `Preparing ${selectedDcaProviderId.toUpperCase()} DCA calls on ${chainId.toLiteral()}...`
      );

      let prepared: PreparedDcaAction;
      try {
        prepared = await wallet.dca().prepareCreate(createRequest);
      } catch (error) {
        const message = describeDcaError(error);
        setDcaError(message);
        addLog(
          `DCA create preparation failed for ${selectedDcaProviderId.toUpperCase()} on ${chainId.toLiteral()}: ${message}`
        );
        return;
      }

      addLog(
        `Prepared ${prepared.providerId.toUpperCase()} DCA create: ${prepared.calls.length} call${prepared.calls.length === 1 ? "" : "s"}${prepared.orderAddress ? `, order ${cropAddress(prepared.orderAddress)}` : ""}`
      );

      let tx: Tx;
      try {
        tx = await wallet.execute(
          prepared.calls,
          wantsSponsored ? { feeMode: "sponsored" } : undefined
        );
      } catch (error) {
        const message = describeDcaError(error);
        setDcaError(message);
        addLog(
          `DCA transaction submission failed for ${prepared.providerId.toUpperCase()} on ${chainId.toLiteral()} (${wantsSponsored ? "sponsored" : "user_pays"}): ${message}`
        );
        return;
      }

      addLog(`DCA create tx submitted: ${tx.hash.slice(0, 10)}...`);
      addLog(
        wantsSponsored
          ? "DCA transaction submitted in sponsored mode"
          : "DCA transaction submitted in user_pays mode"
      );

      showTransactionToast(
        {
          txHash: tx.hash,
          title: `Creating ${dcaSellToken.symbol} DCA`,
          subtitle: `${dcaCycleAmount} / cycle into ${dcaBuyToken.symbol}`,
          explorerUrl: getExplorerUrl(tx.hash, chainId),
        },
        true
      );

      addLog("Waiting for DCA confirmation...");
      try {
        await tx.wait();
      } catch (error) {
        const message = describeDcaError(error);
        setDcaError(message);
        addLog(
          `DCA confirmation failed for ${prepared.providerId.toUpperCase()} on ${chainId.toLiteral()}: ${message}`
        );
        return;
      }

      updateTransactionToast({
        txHash: tx.hash,
        title: "DCA Created",
        subtitle: `${dcaSellToken.symbol} -> ${dcaBuyToken.symbol} confirmed`,
        explorerUrl: getExplorerUrl(tx.hash, chainId),
      });

      addLog("DCA order created");
      await fetchBalances(wallet, chainId);
      await refreshDcaOrders();
    } catch (error) {
      const message = describeDcaError(error);
      setDcaError(message);
      addLog(`DCA creation failed: ${message}`);
    } finally {
      setIsDcaSubmitting(false);
    }
  }, [
    addLog,
    canUseSponsored,
    chainId,
    dcaBuyToken,
    dcaCycleAmount,
    dcaFrequency,
    dcaSellToken,
    dcaTotalAmount,
    fetchBalances,
    parsedDcaCycleAmount,
    parsedDcaTotalAmount,
    refreshDcaOrders,
    selectedDcaProviderId,
    useSponsored,
    wallet,
  ]);

  const handleCancelDcaOrder = useCallback(
    async (order: DcaOrder) => {
      if (!wallet) {
        return;
      }

      setCancellingDcaOrderId(order.id);
      setDcaError(null);

      try {
        const wantsSponsored = useSponsored && canUseSponsored;
        addLog(
          `Cancelling ${getDcaProviderLabel(order.providerId)} DCA order ${cropAddress(order.orderAddress)}`
        );

        const tx = await wallet
          .dca()
          .cancel(
            buildDcaCancelInput(order),
            wantsSponsored ? { feeMode: "sponsored" } : undefined
          );

        showTransactionToast(
          {
            txHash: tx.hash,
            title: "Cancelling DCA",
            subtitle: cropAddress(order.orderAddress),
            explorerUrl: getExplorerUrl(tx.hash, chainId),
          },
          true
        );

        addLog("Waiting for cancel confirmation...");
        await tx.wait();

        updateTransactionToast({
          txHash: tx.hash,
          title: "DCA Cancelled",
          subtitle: cropAddress(order.orderAddress),
          explorerUrl: getExplorerUrl(tx.hash, chainId),
        });

        addLog(`DCA order cancelled: ${cropAddress(order.orderAddress)}`);
        await fetchBalances(wallet, chainId);
        await refreshDcaOrders();
      } catch (error) {
        const message = describeDcaError(error);
        setDcaError(message);
        addLog(`DCA cancel failed: ${message}`);
      } finally {
        setCancellingDcaOrderId(null);
      }
    },
    [
      addLog,
      canUseSponsored,
      chainId,
      fetchBalances,
      refreshDcaOrders,
      useSponsored,
      wallet,
    ]
  );

  return {
    selectedDcaProviderId,
    selectedDcaPreviewProviderId,
    dcaSellToken,
    dcaBuyToken,
    dcaTotalAmount,
    dcaCycleAmount,
    dcaFrequency,
    dcaPreview,
    dcaError,
    dcaOrdersError,
    dcaOrders,
    isDcaPreviewing,
    isDcaSubmitting,
    isRefreshingDcaOrders,
    cancellingDcaOrderId,
    canPreviewDca,
    canCreateDca,
    dcaExceedsBalance,
    dcaSameToken,
    dcaCycleExceedsTotal,
    parsedDcaTotalAmount,
    parsedDcaCycleAmount,
    dcaTotalAmountError,
    dcaCycleAmountError,
    dcaPreviewProviderLabel,
    dcaBackendLabel,
    dcaSellBalance,
    selectedDcaProvider,
    selectedDcaPreviewProvider,
    handleSelectDcaProvider,
    handleSelectDcaPreviewProvider,
    handleSelectDcaSellToken,
    handleSelectDcaBuyToken,
    handleSelectDcaFrequency,
    handlePreviewDca,
    handleCreateDca,
    handleCancelDcaOrder,
    handleFlipDcaTokens,
    handleDcaTotalAmountChange,
    handleDcaCycleAmountChange,
    refreshDcaOrders,
  };
}
