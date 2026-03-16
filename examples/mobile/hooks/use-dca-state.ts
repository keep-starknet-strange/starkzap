import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Amount,
  type ChainId,
  type DcaOrder,
  type DcaProvider,
  type SwapProvider,
  type Token,
  type WalletInterface,
} from "starkzap";
import {
  showTransactionToast,
  updateTransactionToast,
} from "@/components/Toast";
import { getSwapProviderLabel } from "@/swaps";

const DCA_ORDER_PAGE_SIZE = 6;

export const DCA_FREQUENCY_OPTIONS = [
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
  if (frequency === "CONTINUOUS") {
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

  // Setters (for token picker integration)
  setDcaSellToken: React.Dispatch<React.SetStateAction<Token>>;
  setDcaBuyToken: React.Dispatch<React.SetStateAction<Token>>;
  setDcaPreview: React.Dispatch<React.SetStateAction<DcaPreviewState | null>>;
  setDcaError: React.Dispatch<React.SetStateAction<string | null>>;
  setDcaFrequency: React.Dispatch<React.SetStateAction<DcaFrequencyValue>>;

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

  // Reset preview on chain change
  useEffect(() => {
    setDcaPreview(null);
    setDcaError(null);
  }, [chainId]);

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
        setDcaOrders(page.content);
        setDcaOrdersError(null);
        if (!silent) {
          addLog(
            `Loaded ${page.content.length} ${selectedDcaProviderId.toUpperCase()} DCA orders`
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setDcaOrdersError(message);
        addLog(`DCA orders refresh failed: ${message}`);
      } finally {
        setIsRefreshingDcaOrders(false);
      }
    },
    [addLog, selectedDcaProviderId, wallet]
  );

  // Auto-refresh orders when on DCA tab
  useEffect(() => {
    if (screenMode !== "dca" || !wallet) {
      return;
    }
    void refreshDcaOrders(true);
  }, [chainId, refreshDcaOrders, screenMode, selectedDcaProviderId, wallet]);

  const handleSelectDcaProvider = useCallback((providerId: string) => {
    setSelectedDcaProviderId(providerId);
    setDcaOrders([]);
    setDcaPreview(null);
    setDcaError(null);
    setDcaOrdersError(null);
  }, []);

  const handleSelectDcaPreviewProvider = useCallback(
    (integrationId: string) => {
      setSelectedDcaPreviewProviderId(integrationId);
      setDcaPreview(null);
      setDcaError(null);
    },
    []
  );

  const handleFlipDcaTokens = useCallback(() => {
    setDcaSellToken(dcaBuyToken);
    setDcaBuyToken(dcaSellToken);
    setDcaPreview(null);
    setDcaError(null);
  }, [dcaBuyToken, dcaSellToken]);

  const handleDcaTotalAmountChange = useCallback((value: string) => {
    setDcaTotalAmount(value);
    setDcaPreview(null);
    setDcaError(null);
  }, []);

  const handleDcaCycleAmountChange = useCallback((value: string) => {
    setDcaCycleAmount(value);
    setDcaPreview(null);
    setDcaError(null);
  }, []);

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
      const message = error instanceof Error ? error.message : String(error);
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
      addLog(
        `Creating ${selectedDcaProviderId.toUpperCase()} DCA order ${dcaTotalAmount} ${dcaSellToken.symbol} total / ${dcaCycleAmount} per cycle into ${dcaBuyToken.symbol} (${dcaFrequency})`
      );

      const tx = await wallet.dca().create(
        {
          provider: selectedDcaProviderId,
          buyToken: dcaBuyToken,
          frequency: dcaFrequency,
          sellAmount: parsedDcaTotalAmount,
          sellAmountPerCycle: parsedDcaCycleAmount,
          sellToken: dcaSellToken,
        },
        wantsSponsored ? { feeMode: "sponsored" } : undefined
      );

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
      await tx.wait();

      updateTransactionToast({
        txHash: tx.hash,
        title: "DCA Created",
        subtitle: `${dcaSellToken.symbol} -> ${dcaBuyToken.symbol} confirmed`,
        explorerUrl: getExplorerUrl(tx.hash, chainId),
      });

      addLog("DCA order created");
      await fetchBalances(wallet, chainId);
      await refreshDcaOrders(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
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
        await refreshDcaOrders(true);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
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
    setDcaSellToken,
    setDcaBuyToken,
    setDcaPreview,
    setDcaError,
    setDcaFrequency,
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
    handlePreviewDca,
    handleCreateDca,
    handleCancelDcaOrder,
    handleFlipDcaTokens,
    handleDcaTotalAmountChange,
    handleDcaCycleAmountChange,
    refreshDcaOrders,
  };
}
