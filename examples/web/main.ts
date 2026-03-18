import {
  Amount,
  StarkZap,
  StarkSigner,
  OnboardStrategy,
  ChainId,
  getPresets,
  OpenZeppelinPreset,
  ArgentPreset,
  ArgentXV050Preset,
  BraavosPreset,
  DevnetPreset,
  DCA_CONTINUOUS_FREQUENCY,
  TongoConfidential,
  ExternalChain,
  Protocol,
  type Eip1193Provider,
  type SolanaProvider,
  type DcaProvider,
  type DcaOrder,
  type WalletInterface,
  type AccountClassConfig,
  type SwapProvider,
  type Token,
  fromAddress,
} from "starkzap";
import { ec, RpcProvider } from "starknet";
import { getSwapProviders } from "./swaps";
import {
  BridgeController,
  initializeAppKit,
  formatFeeEstimate,
} from "./bridge";
import { getDcaProviders } from "./dca";

// Configuration
const NETWORK =
  (import.meta.env.VITE_NETWORK as string | undefined)?.toLowerCase() ===
  "mainnet"
    ? "mainnet"
    : "sepolia";
const RPC_URL =
  (import.meta.env.VITE_RPC_URL as string | undefined) ??
  `https://api.cartridge.gg/x/starknet/${NETWORK}/rpc/v0_9`;
const PRIVY_SERVER_URL = "http://localhost:3001";
const DUMMY_POLICY = {
  target: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d", // STRK
  method: "transfer",
};
const SDK_CHAIN_ID = NETWORK === "mainnet" ? ChainId.MAINNET : ChainId.SEPOLIA;
const ALCHEMY_API_KEY = import.meta.env.VITE_ALCHEMY_API_KEY as
  | string
  | undefined;
const OFT_PUBLIC_KEY = import.meta.env.VITE_OFT_PUBLIC_KEY as
  | string
  | undefined;
const BPS_DENOMINATOR = 10_000n;
const DEFAULT_SLIPPAGE_BPS = 100n;
const DEFAULT_DCA_FREQUENCY = "P1D";
const DCA_ORDER_PAGE_SIZE = 8;
const DCA_FREQUENCY_OPTIONS = [
  { value: "PT12H", label: "Every 12 hours" },
  { value: "P1D", label: "Daily" },
  { value: "P3D", label: "Every 3 days" },
  { value: "P1W", label: "Weekly" },
] as const;

// Tongo confidential contract addresses per token
// Full list: https://docs.tongo.cash/protocol/contracts.html
const TONGO_CONTRACTS_SEPOLIA: Record<string, string> = {
  STRK: "0x408163bfcfc2d76f34b444cb55e09dace5905cf84c0884e4637c2c0f06ab6ed",
  ETH: "0x2cf0dc1d9e8c7731353dd15e6f2f22140120ef2d27116b982fa4fed87f6fef5",
  USDC: "0x2caae365e67921979a4e5c16dd70eaa5776cfc6a9592bcb903d91933aaf2552",
  WBTC: "0x02b9f62f9be99590ad2505e9e89ca746c8fb67bdb6a4be2a1b9a1d867af7339e",
};
const TONGO_CONTRACTS_MAINNET: Record<string, string> = {
  STRK: "0x3a542d7eb73b3e33a2c54e9827ec17a6365e289ec35ccc94dde97950d9db498",
  ETH: "0x276e11a5428f6de18a38b7abc1d60abc75ce20aa3a925e20a393fcec9104f89",
  WBTC: "0x6d82c8c467eac77f880a1d5a090e0e0094a557bf67d74b98ba1881200750e27",
  "USDC.e": "0x72098b84989a45cc00697431dfba300f1f5d144ae916e98287418af4e548d96",
  USDC: "0x026f79017c3c382148832c6ae50c22502e66f7a2f81ccbdb9e1377af31859d3a",
  USDT: "0x659c62ba8bc3ac92ace36ba190b350451d0c767aa973dd63b042b59cc065da0",
  DAI: "0x511741b1ad1777b4ad59fbff49d64b8eb188e2aeb4fc72438278a589d8a10d8",
};
const TONGO_CONTRACTS = SDK_CHAIN_ID.isSepolia()
  ? TONGO_CONTRACTS_SEPOLIA
  : TONGO_CONTRACTS_MAINNET;

const swapProviders: SwapProvider[] = getSwapProviders();
const swapProvidersById = new Map<string, SwapProvider>(
  swapProviders.map((provider) => [provider.id, provider])
);
const dcaProviders: DcaProvider[] = getDcaProviders();
const dcaProvidersById = new Map<string, DcaProvider>(
  dcaProviders.map((provider) => [provider.id, provider])
);
const presetTokens = Object.values(getPresets(SDK_CHAIN_ID)).sort((a, b) =>
  a.symbol.localeCompare(b.symbol)
);
const dcaTokens = getDcaDemoTokens();

// SDK instance
const sdk = new StarkZap({
  rpcUrl: RPC_URL,
  chainId: SDK_CHAIN_ID,
  ...(ALCHEMY_API_KEY || OFT_PUBLIC_KEY
    ? {
        bridging: {
          ...(ALCHEMY_API_KEY && {
            ethereumRpcUrl:
              NETWORK === "mainnet"
                ? `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`
                : `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
            solanaRpcUrl:
              NETWORK === "mainnet"
                ? `https://solana-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`
                : undefined,
          }),
          ...(OFT_PUBLIC_KEY && { layerZeroApiKey: OFT_PUBLIC_KEY }),
        },
      }
    : {}),
});

// Current wallet
let wallet: WalletInterface | null = null;
let walletType: "cartridge" | "privatekey" | "privy" | null = null;
let confidential: TongoConfidential | null = null;
let dcaOrdersRequestId = 0;

// DOM Elements
const walletSection = document.getElementById("wallet-section")!;
const pkForm = document.getElementById("pk-form")!;
const logContainer = document.getElementById("log")!;
const networkBadge = document.getElementById("network-badge")!;
networkBadge.textContent = NETWORK;

const btnCartridge = document.getElementById(
  "btn-cartridge"
) as HTMLButtonElement;
const btnTogglePk = document.getElementById(
  "btn-toggle-pk"
) as HTMLButtonElement;
const btnPrivy = document.getElementById("btn-privy") as HTMLButtonElement;
const btnConnectPk = document.getElementById(
  "btn-connect-pk"
) as HTMLButtonElement;
const btnConnectPrivy = document.getElementById(
  "btn-connect-privy"
) as HTMLButtonElement;
const btnCheckDeployed = document.getElementById(
  "btn-check-deployed"
) as HTMLButtonElement;
const btnDeploy = document.getElementById("btn-deploy") as HTMLButtonElement;
const btnDisconnect = document.getElementById(
  "btn-disconnect"
) as HTMLButtonElement;
const btnTransfer = document.getElementById(
  "btn-transfer"
) as HTMLButtonElement;
const btnTransferSponsored = document.getElementById(
  "btn-transfer-sponsored"
) as HTMLButtonElement;
const privateKeyInput = document.getElementById(
  "private-key"
) as HTMLInputElement;
const btnGenerateKey = document.getElementById(
  "btn-generate-key"
) as HTMLButtonElement;
const privyEmailInput = document.getElementById(
  "privy-email"
) as HTMLInputElement;
const accountPresetSelect = document.getElementById(
  "account-preset"
) as HTMLSelectElement;
const privyAccountPresetSelect = document.getElementById(
  "privy-account-preset"
) as HTMLSelectElement;
const privyForm = document.getElementById("privy-form")!;
const walletAddressEl = document.getElementById("wallet-address")!;
const btnCopyAddress = document.getElementById(
  "btn-copy-address"
) as HTMLButtonElement;
const walletStatusEl = document.getElementById("wallet-status")!;
const walletTypeLabelEl = document.getElementById("wallet-type-label")!;
const swapProviderSelect = document.getElementById(
  "swap-provider"
) as HTMLSelectElement;
const swapTokenInSelect = document.getElementById(
  "swap-token-in"
) as HTMLSelectElement;
const swapTokenOutSelect = document.getElementById(
  "swap-token-out"
) as HTMLSelectElement;
const swapAmountInput = document.getElementById(
  "swap-amount"
) as HTMLInputElement;
const swapSlippageInput = document.getElementById(
  "swap-slippage"
) as HTMLInputElement;
const swapSponsoredInput = document.getElementById(
  "swap-sponsored"
) as HTMLInputElement;
const btnSwapQuote = document.getElementById(
  "btn-swap-quote"
) as HTMLButtonElement;
const btnSwapSubmit = document.getElementById(
  "btn-swap-submit"
) as HTMLButtonElement;
const swapQuoteEl = document.getElementById("swap-quote")!;
const dcaPreviewProviderSelect = document.getElementById(
  "dca-preview-provider"
) as HTMLSelectElement;
const dcaProviderSelect = document.getElementById(
  "dca-provider"
) as HTMLSelectElement;
const dcaTokenInSelect = document.getElementById(
  "dca-token-in"
) as HTMLSelectElement;
const dcaTokenOutSelect = document.getElementById(
  "dca-token-out"
) as HTMLSelectElement;
const dcaTotalAmountInput = document.getElementById(
  "dca-total-amount"
) as HTMLInputElement;
const dcaCycleAmountInput = document.getElementById(
  "dca-cycle-amount"
) as HTMLInputElement;
const dcaFrequencySelect = document.getElementById(
  "dca-frequency"
) as HTMLSelectElement;
const dcaMinBuyInput = document.getElementById(
  "dca-min-buy"
) as HTMLInputElement;
const dcaMaxBuyInput = document.getElementById(
  "dca-max-buy"
) as HTMLInputElement;
const dcaSponsoredInput = document.getElementById(
  "dca-sponsored"
) as HTMLInputElement;
const btnDcaPreview = document.getElementById(
  "btn-dca-preview"
) as HTMLButtonElement;
const btnDcaCreate = document.getElementById(
  "btn-dca-create"
) as HTMLButtonElement;
const btnDcaRefresh = document.getElementById(
  "btn-dca-refresh"
) as HTMLButtonElement;
const dcaPreviewEl = document.getElementById("dca-preview")!;
const dcaOrdersEl = document.getElementById("dca-orders")!;

// Tongo DOM elements
const tongoTokenSelect = document.getElementById(
  "tongo-token-select"
) as HTMLSelectElement;
const btnTongoInit = document.getElementById(
  "btn-tongo-init"
) as HTMLButtonElement;
const tongoOpsEl = document.getElementById("tongo-ops")!;
const tongoAddressEl = document.getElementById("tongo-address")!;
const tongoBalanceEl = document.getElementById("tongo-balance")!;
const tongoPendingEl = document.getElementById("tongo-pending")!;
const tongoNonceEl = document.getElementById("tongo-nonce")!;
const tongoFundAmountInput = document.getElementById(
  "tongo-fund-amount"
) as HTMLInputElement;
const btnTongoFund = document.getElementById(
  "btn-tongo-fund"
) as HTMLButtonElement;
const tongoTransferRxInput = document.getElementById(
  "tongo-transfer-rx"
) as HTMLInputElement;
const tongoTransferRyInput = document.getElementById(
  "tongo-transfer-ry"
) as HTMLInputElement;
const tongoTransferAmountInput = document.getElementById(
  "tongo-transfer-amount"
) as HTMLInputElement;
const btnTongoTransfer = document.getElementById(
  "btn-tongo-transfer"
) as HTMLButtonElement;
const tongoWithdrawAmountInput = document.getElementById(
  "tongo-withdraw-amount"
) as HTMLInputElement;
const tongoWithdrawToInput = document.getElementById(
  "tongo-withdraw-to"
) as HTMLInputElement;
const btnTongoWithdraw = document.getElementById(
  "btn-tongo-withdraw"
) as HTMLButtonElement;
const btnTongoRollover = document.getElementById(
  "btn-tongo-rollover"
) as HTMLButtonElement;
const tongoRagequitToInput = document.getElementById(
  "tongo-ragequit-to"
) as HTMLInputElement;
const btnTongoRagequit = document.getElementById(
  "btn-tongo-ragequit"
) as HTMLButtonElement;
const btnTongoRefresh = document.getElementById(
  "btn-tongo-refresh"
) as HTMLButtonElement;

// Bridge DOM elements
const bridgeSection = document.getElementById("bridge-section")!;
const bridgeDirectionBtn = document.getElementById(
  "bridge-direction-btn"
) as HTMLButtonElement;
const btnAppkitConnect = document.getElementById(
  "btn-appkit-connect"
) as HTMLButtonElement;
const bridgeEthAddress = document.getElementById("bridge-eth-address")!;
const bridgeTokenSelect = document.getElementById(
  "bridge-token"
) as HTMLSelectElement;
const btnBridgeRefresh = document.getElementById(
  "btn-bridge-refresh"
) as HTMLButtonElement;
const bridgeStarknetBalanceEl = document.getElementById(
  "bridge-starknet-balance"
)!;
const bridgeExternalBalanceLabel = document.getElementById(
  "bridge-external-balance-label"
)!;
const bridgeExternalBalanceEl = document.getElementById(
  "bridge-external-balance"
)!;
const bridgeAllowanceRow = document.getElementById("bridge-allowance-row")!;
const bridgeAllowanceEl = document.getElementById("bridge-allowance")!;
const bridgeFastTransferRow = document.getElementById(
  "bridge-fast-transfer-row"
)!;
const bridgeFastTransferInput = document.getElementById(
  "bridge-fast-transfer"
) as HTMLInputElement;
const bridgeFeesSection = document.getElementById("bridge-fees-section")!;
const bridgeFeesEl = document.getElementById("bridge-fees")!;
const bridgeAmountInput = document.getElementById(
  "bridge-amount"
) as HTMLInputElement;
const btnBridgeDeposit = document.getElementById(
  "btn-bridge-deposit"
) as HTMLButtonElement;

// Reown AppKit + Bridge Controller
const REOWN_PROJECT_ID = import.meta.env.VITE_REOWN_PROJECT_ID as
  | string
  | undefined;
const AUTO_PRIVATE_KEY = import.meta.env.VITE_PRIVATE_KEY as string | undefined;
const AUTO_ACCOUNT_PRESET = import.meta.env.VITE_ACCOUNT_PRESET as
  | string
  | undefined;
let appKit: ReturnType<typeof initializeAppKit> | null = null;
let bridgeController: BridgeController | null = null;

if (REOWN_PROJECT_ID) {
  appKit = initializeAppKit(REOWN_PROJECT_ID);
  bridgeController = new BridgeController(sdk, SDK_CHAIN_ID, log, renderBridge);
} else {
  log("VITE_REOWN_PROJECT_ID not set - bridge disabled", "info");
}

// Preset mapping
const presets: Record<string, AccountClassConfig> = {
  openzeppelin: OpenZeppelinPreset,
  argent: ArgentPreset,
  argentx050: ArgentXV050Preset,
  braavos: BraavosPreset,
  devnet: DevnetPreset,
};

function tokenOptionLabel(token: Token): string {
  return `${token.symbol} (${token.name})`;
}

function formatProtocolTag(protocol: Protocol): string {
  switch (protocol) {
    case Protocol.CCTP:
      return "[CCTP]";
    case Protocol.CANONICAL:
      return "[Canonical]";
    case Protocol.OFT:
      return "[OFT]";
    case Protocol.OFT_MIGRATED:
      return "[OFT Migrated]";
    case Protocol.HYPERLANE:
      return "[Hyperlane]";
    default:
      return `[${String(protocol)}]`;
  }
}

function getTokenByAddress(
  address: string,
  tokens: readonly Token[] = presetTokens
): Token | null {
  const token = tokens.find((item) => item.address === address);
  return token ?? null;
}

function getDcaDemoTokens(): Token[] {
  const preferredSymbols = SDK_CHAIN_ID.isSepolia()
    ? ["STRK", "USDC.e", "USDC", "ETH", "WBTC"]
    : ["STRK", "USDC", "USDT", "DAI", "ETH", "WBTC"];

  const selected: Token[] = [];
  for (const symbol of preferredSymbols) {
    const token = presetTokens.find((item) => item.symbol === symbol);
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

  return presetTokens.slice(0, Math.min(presetTokens.length, 6));
}

function getPreferredSwapTokens(): { tokenIn: Token; tokenOut: Token } {
  const fallback = presetTokens[0];
  if (!fallback) {
    throw new Error("No token presets available for this chain");
  }

  const tokenIn =
    presetTokens.find((token) => token.symbol === "STRK") ?? fallback;
  const preferredOutSymbols = SDK_CHAIN_ID.isSepolia()
    ? ["USDC.e", "USDC", "ETH"]
    : ["USDC", "USDT", "DAI", "ETH"];

  for (const symbol of preferredOutSymbols) {
    const tokenOut = presetTokens.find((token) => token.symbol === symbol);
    if (tokenOut && tokenOut.address !== tokenIn.address) {
      return { tokenIn, tokenOut };
    }
  }

  const tokenOut =
    presetTokens.find((token) => token.address !== tokenIn.address) ?? tokenIn;
  return { tokenIn, tokenOut };
}

function getPreferredDcaTokens(): { tokenIn: Token; tokenOut: Token } {
  const fallback = dcaTokens[0];
  if (!fallback) {
    throw new Error("No curated DCA tokens available for this chain");
  }

  const tokenIn =
    dcaTokens.find((token) => token.symbol === "STRK") ?? fallback;
  const preferredOutSymbols = SDK_CHAIN_ID.isSepolia()
    ? ["USDC.e", "USDC", "ETH"]
    : ["USDC", "USDT", "DAI", "ETH"];

  for (const symbol of preferredOutSymbols) {
    const tokenOut = dcaTokens.find((token) => token.symbol === symbol);
    if (tokenOut && tokenOut.address !== tokenIn.address) {
      return { tokenIn, tokenOut };
    }
  }

  const tokenOut =
    dcaTokens.find((token) => token.address !== tokenIn.address) ?? tokenIn;
  return { tokenIn, tokenOut };
}

function getPreferredDcaPreviewProviderId(): string {
  return swapProvidersById.has("ekubo")
    ? "ekubo"
    : (swapProviders[0]?.id ?? "");
}

function getAvailableDcaProviders(): DcaProvider[] {
  if (!wallet) {
    return dcaProviders;
  }

  return wallet
    .dca()
    .listProviders()
    .map((providerId) => wallet!.dca().getDcaProvider(providerId));
}

function getPreferredDcaProviderId(): string {
  const availableProviders = getAvailableDcaProviders();
  return (
    availableProviders.find((provider) => provider.id === "avnu")?.id ??
    availableProviders[0]?.id ??
    ""
  );
}

function isEkuboDcaBackend(providerId: string): boolean {
  return providerId === "ekubo";
}

function clearSwapQuote(): void {
  swapQuoteEl.innerHTML = "";
  swapQuoteEl.classList.add("hidden");
}

function renderSwapQuote(params: {
  providerId: string;
  amountIn: Amount;
  tokenOut: Token;
  amountOutBase: bigint;
  routeCallCount?: number;
  priceImpactBps?: bigint | null;
}): void {
  const amountOut = Amount.fromRaw(
    params.amountOutBase,
    params.tokenOut.decimals,
    params.tokenOut.symbol
  );
  const priceImpactText =
    params.priceImpactBps == null
      ? "n/a"
      : `${(Number(params.priceImpactBps) / 100).toFixed(2)}%`;
  const routeCalls =
    params.routeCallCount != null ? `${params.routeCallCount}` : "n/a";

  swapQuoteEl.innerHTML = `
    <div class="quote-row"><span class="quote-label">Source</span><span class="quote-value">${params.providerId.toUpperCase()}</span></div>
    <div class="quote-row"><span class="quote-label">Amount In</span><span class="quote-value">${params.amountIn.toFormatted(true)}</span></div>
    <div class="quote-row"><span class="quote-label">Amount Out</span><span class="quote-value">${amountOut.toFormatted(true)}</span></div>
    <div class="quote-row"><span class="quote-label">Price Impact</span><span class="quote-value">${priceImpactText}</span></div>
    <div class="quote-row"><span class="quote-label">Route Calls</span><span class="quote-value">${routeCalls}</span></div>
  `;
  swapQuoteEl.classList.remove("hidden");
}

function updateSwapButtons(): void {
  const isWalletConnected = wallet != null;
  const hasProvider = swapProviderSelect.value.length > 0;
  const hasAmount = swapAmountInput.value.trim().length > 0;
  btnSwapQuote.disabled = !isWalletConnected || !hasProvider || !hasAmount;
  btnSwapSubmit.disabled = !isWalletConnected || !hasProvider || !hasAmount;
}

function normalizeSwapTokenSelection(changed: "in" | "out"): void {
  if (swapTokenInSelect.value !== swapTokenOutSelect.value) {
    return;
  }

  const alternative = presetTokens.find(
    (token) => token.address !== swapTokenInSelect.value
  );
  if (!alternative) {
    return;
  }

  if (changed === "in") {
    swapTokenOutSelect.value = alternative.address;
  } else {
    swapTokenInSelect.value = alternative.address;
  }
}

function populateSwapProviders(): void {
  swapProviderSelect.innerHTML = "";
  for (const provider of swapProviders) {
    const option = document.createElement("option");
    option.value = provider.id;
    option.textContent = provider.id.toUpperCase();
    swapProviderSelect.appendChild(option);
  }
}

function populateSwapTokens(): void {
  swapTokenInSelect.innerHTML = "";
  swapTokenOutSelect.innerHTML = "";

  for (const token of presetTokens) {
    const inOption = document.createElement("option");
    inOption.value = token.address;
    inOption.textContent = tokenOptionLabel(token);
    swapTokenInSelect.appendChild(inOption);

    const outOption = document.createElement("option");
    outOption.value = token.address;
    outOption.textContent = tokenOptionLabel(token);
    swapTokenOutSelect.appendChild(outOption);
  }

  const preferred = getPreferredSwapTokens();
  swapTokenInSelect.value = preferred.tokenIn.address;
  swapTokenOutSelect.value = preferred.tokenOut.address;
}

function parseSlippageBps(): bigint | undefined {
  const raw = swapSlippageInput.value.trim();
  if (!raw) {
    return undefined;
  }

  if (!/^\d+$/.test(raw)) {
    throw new Error("Slippage must be an integer in basis points");
  }

  const bps = BigInt(raw);
  if (bps >= BPS_DENOMINATOR) {
    throw new Error("Slippage must be lower than 10000 bps");
  }
  return bps;
}

function buildSwapInput() {
  const providerId = swapProviderSelect.value;
  if (!providerId || !swapProvidersById.has(providerId)) {
    throw new Error("Select a valid swap source");
  }

  const tokenIn = getTokenByAddress(swapTokenInSelect.value);
  if (!tokenIn) {
    throw new Error("Select token in");
  }

  const tokenOut = getTokenByAddress(swapTokenOutSelect.value);
  if (!tokenOut) {
    throw new Error("Select token out");
  }

  if (tokenIn.address === tokenOut.address) {
    throw new Error("Token in and token out must be different");
  }

  const rawAmount = swapAmountInput.value.trim();
  if (!rawAmount) {
    throw new Error("Enter an amount to swap");
  }

  const amountIn = Amount.parse(rawAmount, tokenIn);
  if (amountIn.toBase() <= 0n) {
    throw new Error("Amount must be greater than zero");
  }

  const slippageBps = parseSlippageBps();
  return {
    providerId,
    tokenIn,
    tokenOut,
    amountIn,
    slippageBps,
  };
}

function registerWalletSwapProviders(connectedWallet: WalletInterface): void {
  let makeDefault = true;
  for (const provider of swapProviders) {
    connectedWallet.registerSwapProvider(provider, makeDefault);
    makeDefault = false;
  }
}

function initializeSwapForm(): void {
  populateSwapProviders();
  populateSwapTokens();
  swapSlippageInput.value = DEFAULT_SLIPPAGE_BPS.toString();
  swapSponsoredInput.checked = false;
  clearSwapQuote();
  updateSwapButtons();
}

function clearDcaPreview(): void {
  dcaPreviewEl.replaceChildren();
  dcaPreviewEl.classList.add("hidden");
}

function clearDcaPricingBounds(): void {
  dcaMinBuyInput.value = "";
  dcaMaxBuyInput.value = "";
}

function createQuoteRow(label: string, value: string): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "quote-row";

  const labelEl = document.createElement("span");
  labelEl.className = "quote-label";
  labelEl.textContent = label;

  const valueEl = document.createElement("span");
  valueEl.className = "quote-value";
  valueEl.textContent = value;

  row.append(labelEl, valueEl);
  return row;
}

function createOrderMeta(label: string, value: string): HTMLDivElement {
  const meta = document.createElement("div");
  meta.className = "order-meta";

  const labelEl = document.createElement("span");
  labelEl.className = "order-meta-label";
  labelEl.textContent = label;

  const valueEl = document.createElement("span");
  valueEl.className = "order-meta-value";
  valueEl.textContent = value;

  meta.append(labelEl, valueEl);
  return meta;
}

function getDcaStatusBadgeClass(status: DcaOrder["status"]): string {
  if (status === "ACTIVE") {
    return "status-deployed";
  }
  if (status === "INDEXING") {
    return "status-checking";
  }
  return "status-not-deployed";
}

function resetDcaRefreshButton(): void {
  setButtonLoading(btnDcaRefresh, false, "Refresh Orders");
}

function renderDcaPreview(params: {
  dcaProviderId: string;
  previewProviderId: string;
  sellAmountPerCycle: Amount;
  tokenOut: Token;
  amountOutBase: bigint;
  routeCallCount?: number;
  priceImpactBps?: bigint | null;
}): void {
  const amountOut = Amount.fromRaw(
    params.amountOutBase,
    params.tokenOut.decimals,
    params.tokenOut.symbol
  );
  const priceImpactText =
    params.priceImpactBps == null
      ? "n/a"
      : `${(Number(params.priceImpactBps) / 100).toFixed(2)}%`;
  const routeCalls =
    params.routeCallCount != null ? `${params.routeCallCount}` : "n/a";

  dcaPreviewEl.replaceChildren(
    createQuoteRow("Preview Source", params.previewProviderId.toUpperCase()),
    createQuoteRow("Cycle Sell", params.sellAmountPerCycle.toFormatted(true)),
    createQuoteRow("Estimated Cycle Buy", amountOut.toFormatted(true)),
    createQuoteRow("Price Impact", priceImpactText),
    createQuoteRow("Route Calls", routeCalls),
    createQuoteRow("Recurring Backend", params.dcaProviderId.toUpperCase())
  );
  dcaPreviewEl.classList.remove("hidden");
}

function renderEmptyDcaOrders(message: string): void {
  const emptyState = document.createElement("div");
  emptyState.className = "orders-empty";
  emptyState.textContent = message;
  dcaOrdersEl.replaceChildren(emptyState);
}

function describeTokenAddress(address: string): string {
  return getTokenByAddress(address)?.symbol ?? truncateAddress(address);
}

function formatTokenAmount(base: bigint, tokenAddress: string): string {
  const token = getTokenByAddress(tokenAddress);
  if (!token) {
    return `${base.toString()} (${truncateAddress(tokenAddress)})`;
  }
  return Amount.fromRaw(base, token.decimals, token.symbol).toFormatted(true);
}

function getDcaBackendLabel(providerId: string): string {
  return providerId.toUpperCase();
}

function formatDcaFrequency(order: DcaOrder): string {
  return order.frequency === DCA_CONTINUOUS_FREQUENCY
    ? "Continuous"
    : order.frequency;
}

function buildDcaCancelInput(order: DcaOrder) {
  return order.providerId === "ekubo"
    ? { provider: order.providerId, orderId: order.id }
    : { provider: order.providerId, orderAddress: order.orderAddress };
}

async function cancelDcaOrder(
  order: DcaOrder,
  button: HTMLButtonElement
): Promise<void> {
  if (!wallet) {
    return;
  }

  setButtonLoading(button, true);

  try {
    const deployed = await wallet.isDeployed();
    if (!deployed) {
      throw new Error("Account not deployed - deploy first");
    }

    log(
      `Cancelling ${getDcaBackendLabel(order.providerId)} DCA order ${truncateAddress(order.orderAddress)}...`,
      "info"
    );
    const sponsor = dcaSponsoredInput.checked;
    const tx = await wallet
      .dca()
      .cancel(
        buildDcaCancelInput(order),
        sponsor ? { feeMode: "sponsored" } : undefined
      );

    log(`DCA cancel submitted: ${truncateAddress(tx.hash)}`, "success");
    if (sponsor) {
      log("DCA cancellation submitted in sponsored mode", "info");
    }

    log("Waiting for DCA cancellation confirmation...", "info");
    await tx.wait();
    log("DCA order cancelled!", "success");
    if (tx.explorerUrl) {
      log(`Explorer: ${tx.explorerUrl}`, "info");
    }

    await refreshDcaOrders(true);
  } catch (err) {
    log(`DCA cancellation failed: ${err}`, "error");
  } finally {
    setButtonLoading(button, false, "Cancel Order");
    updateDcaButtons();
  }
}

function renderDcaOrders(orders: DcaOrder[]): void {
  if (orders.length === 0) {
    renderEmptyDcaOrders("No DCA orders found for this wallet yet.");
    return;
  }

  dcaOrdersEl.replaceChildren();

  for (const order of orders) {
    const card = document.createElement("div");
    card.className = "order-card";

    const orderHeader = document.createElement("div");
    orderHeader.className = "order-header";
    const orderHeaderInfo = document.createElement("div");
    const orderTitle = document.createElement("div");
    orderTitle.className = "order-title";
    orderTitle.textContent = `${describeTokenAddress(order.sellTokenAddress)} -> ${describeTokenAddress(order.buyTokenAddress)}`;

    const orderSubtitle = document.createElement("div");
    orderSubtitle.className = "order-subtitle";
    orderSubtitle.textContent = `${getDcaBackendLabel(order.providerId)} · ${truncateAddress(order.orderAddress)} · ${order.timestamp.toLocaleString()}`;

    orderHeaderInfo.append(orderTitle, orderSubtitle);

    const statusBadge = document.createElement("span");
    statusBadge.className = `status-badge ${getDcaStatusBadgeClass(order.status)}`;
    statusBadge.textContent = order.status;

    orderHeader.append(orderHeaderInfo, statusBadge);
    card.appendChild(orderHeader);

    const orderGrid = document.createElement("div");
    orderGrid.className = "order-grid";
    orderGrid.append(
      createOrderMeta(
        "Total Sell",
        formatTokenAmount(order.sellAmountBase, order.sellTokenAddress)
      ),
      createOrderMeta(
        "Sell / Cycle",
        order.sellAmountPerCycleBase != null
          ? formatTokenAmount(
              order.sellAmountPerCycleBase,
              order.sellTokenAddress
            )
          : "Continuous"
      ),
      createOrderMeta(
        "Bought So Far",
        formatTokenAmount(order.amountBoughtBase, order.buyTokenAddress)
      ),
      createOrderMeta("Frequency", formatDcaFrequency(order)),
      createOrderMeta(
        "Progress",
        `${order.executedTradesCount}/${order.iterations} executed`
      ),
      createOrderMeta(
        "Status Detail",
        `${order.pendingTradesCount} pending · ${order.cancelledTradesCount} cancelled`
      )
    );
    card.appendChild(orderGrid);

    if (order.status !== "CLOSED") {
      const actions = document.createElement("div");
      actions.className = "order-actions";
      const cancelButton = document.createElement("button");
      cancelButton.className = "btn btn-secondary btn-small";
      cancelButton.textContent = "Cancel Order";
      cancelButton.addEventListener("click", () => {
        void cancelDcaOrder(order, cancelButton);
      });
      actions.appendChild(cancelButton);
      card.appendChild(actions);
    }

    dcaOrdersEl.appendChild(card);
  }
}

function updateDcaButtons(): void {
  const isWalletConnected = wallet != null;
  const hasDcaProvider = dcaProviderSelect.value.length > 0;
  const hasPreviewProvider = dcaPreviewProviderSelect.value.length > 0;
  const hasTotal = dcaTotalAmountInput.value.trim().length > 0;
  const hasCycle = dcaCycleAmountInput.value.trim().length > 0;

  btnDcaPreview.disabled =
    !isWalletConnected ||
    !hasDcaProvider ||
    !hasPreviewProvider ||
    !hasTotal ||
    !hasCycle;
  btnDcaCreate.disabled =
    !isWalletConnected || !hasDcaProvider || !hasTotal || !hasCycle;
  btnDcaRefresh.disabled = !isWalletConnected;
}

function normalizeDcaTokenSelection(changed: "in" | "out"): void {
  if (dcaTokenInSelect.value !== dcaTokenOutSelect.value) {
    return;
  }

  const alternative = dcaTokens.find(
    (token) => token.address !== dcaTokenInSelect.value
  );
  if (!alternative) {
    return;
  }

  if (changed === "in") {
    dcaTokenOutSelect.value = alternative.address;
  } else {
    dcaTokenInSelect.value = alternative.address;
  }
}

function populateDcaProviders(): void {
  const availableProviders = getAvailableDcaProviders();
  dcaProviderSelect.innerHTML = "";
  for (const provider of availableProviders) {
    const option = document.createElement("option");
    option.value = provider.id;
    option.textContent = provider.id.toUpperCase();
    dcaProviderSelect.appendChild(option);
  }

  dcaProviderSelect.value = getPreferredDcaProviderId();
}

function populateDcaPreviewProviders(): void {
  dcaPreviewProviderSelect.innerHTML = "";
  for (const provider of swapProviders) {
    const option = document.createElement("option");
    option.value = provider.id;
    option.textContent = provider.id.toUpperCase();
    dcaPreviewProviderSelect.appendChild(option);
  }

  dcaPreviewProviderSelect.value = getPreferredDcaPreviewProviderId();
}

function populateDcaTokens(): void {
  dcaTokenInSelect.innerHTML = "";
  dcaTokenOutSelect.innerHTML = "";

  for (const token of dcaTokens) {
    const inOption = document.createElement("option");
    inOption.value = token.address;
    inOption.textContent = tokenOptionLabel(token);
    dcaTokenInSelect.appendChild(inOption);

    const outOption = document.createElement("option");
    outOption.value = token.address;
    outOption.textContent = tokenOptionLabel(token);
    dcaTokenOutSelect.appendChild(outOption);
  }

  const preferred = getPreferredDcaTokens();
  dcaTokenInSelect.value = preferred.tokenIn.address;
  dcaTokenOutSelect.value = preferred.tokenOut.address;
}

function populateDcaFrequencyOptions(): void {
  dcaFrequencySelect.innerHTML = "";
  for (const optionConfig of DCA_FREQUENCY_OPTIONS) {
    const option = document.createElement("option");
    option.value = optionConfig.value;
    option.textContent = optionConfig.label;
    dcaFrequencySelect.appendChild(option);
  }
  dcaFrequencySelect.value = DEFAULT_DCA_FREQUENCY;
}

function initializeDcaForm(): void {
  populateDcaProviders();
  populateDcaPreviewProviders();
  populateDcaTokens();
  populateDcaFrequencyOptions();
  dcaSponsoredInput.checked = false;
  dcaTotalAmountInput.value = "";
  dcaCycleAmountInput.value = "";
  dcaMinBuyInput.value = "";
  dcaMaxBuyInput.value = "";
  clearDcaPreview();
  renderEmptyDcaOrders("Connect a wallet to load DCA orders.");
  updateDcaButtons();
}

function parseOptionalAmountInput(
  rawValue: string,
  token: Token,
  label: string
): Amount | undefined {
  const raw = rawValue.trim();
  if (!raw) {
    return undefined;
  }

  const amount = Amount.parse(raw, token);
  if (amount.toBase() <= 0n) {
    throw new Error(`${label} must be greater than zero`);
  }
  return amount;
}

function buildDcaInput(options: { requirePreviewProvider?: boolean } = {}) {
  const dcaProviderId = dcaProviderSelect.value;
  if (!dcaProviderId || !dcaProvidersById.has(dcaProviderId)) {
    throw new Error("Select a valid recurring DCA backend");
  }

  const previewProviderId = dcaPreviewProviderSelect.value;
  const hasPreviewProvider =
    previewProviderId.length > 0 && swapProvidersById.has(previewProviderId);
  if (options.requirePreviewProvider && !hasPreviewProvider) {
    throw new Error("Select a valid DCA preview source");
  }

  const sellToken = getTokenByAddress(dcaTokenInSelect.value, dcaTokens);
  if (!sellToken) {
    throw new Error("Select sell token");
  }

  const buyToken = getTokenByAddress(dcaTokenOutSelect.value, dcaTokens);
  if (!buyToken) {
    throw new Error("Select buy token");
  }

  if (sellToken.address === buyToken.address) {
    throw new Error("Sell token and buy token must be different");
  }

  const totalSellAmountRaw = dcaTotalAmountInput.value.trim();
  if (!totalSellAmountRaw) {
    throw new Error("Enter a total sell amount");
  }

  const sellAmount = Amount.parse(totalSellAmountRaw, sellToken);
  if (sellAmount.toBase() <= 0n) {
    throw new Error("Total sell amount must be greater than zero");
  }

  const cycleSellAmountRaw = dcaCycleAmountInput.value.trim();
  if (!cycleSellAmountRaw) {
    throw new Error("Enter a per-cycle sell amount");
  }

  const sellAmountPerCycle = Amount.parse(cycleSellAmountRaw, sellToken);
  if (sellAmountPerCycle.toBase() <= 0n) {
    throw new Error("Per-cycle sell amount must be greater than zero");
  }

  if (sellAmountPerCycle.toBase() > sellAmount.toBase()) {
    throw new Error("Per-cycle sell amount cannot exceed total sell amount");
  }

  const minBuyAmount = parseOptionalAmountInput(
    dcaMinBuyInput.value,
    buyToken,
    "Min buy / cycle"
  );
  const maxBuyAmount = parseOptionalAmountInput(
    dcaMaxBuyInput.value,
    buyToken,
    "Max buy / cycle"
  );

  if (
    minBuyAmount &&
    maxBuyAmount &&
    minBuyAmount.toBase() > maxBuyAmount.toBase()
  ) {
    throw new Error("Min buy / cycle cannot exceed max buy / cycle");
  }

  if (
    isEkuboDcaBackend(dcaProviderId) &&
    (minBuyAmount != null || maxBuyAmount != null)
  ) {
    throw new Error("Ekubo DCA does not support min/max buy constraints");
  }

  return {
    dcaProviderId,
    ...(hasPreviewProvider && { previewProviderId }),
    sellToken,
    buyToken,
    sellAmount,
    sellAmountPerCycle,
    frequency: dcaFrequencySelect.value || DEFAULT_DCA_FREQUENCY,
    ...(!isEkuboDcaBackend(dcaProviderId) && (minBuyAmount || maxBuyAmount)
      ? {
          pricingStrategy: {
            ...(minBuyAmount && { minBuyAmount }),
            ...(maxBuyAmount && { maxBuyAmount }),
          },
        }
      : {}),
  };
}

async function refreshDcaOrders(silent = false): Promise<void> {
  const requestId = ++dcaOrdersRequestId;
  const currentWallet = wallet;
  if (!currentWallet) {
    renderEmptyDcaOrders("Connect a wallet to load DCA orders.");
    return;
  }

  const currentProvider = dcaProviderSelect.value;
  if (!currentProvider || !dcaProvidersById.has(currentProvider)) {
    renderEmptyDcaOrders("Select a DCA backend to load orders.");
    return;
  }

  const isCurrentRequest = (): boolean =>
    requestId === dcaOrdersRequestId &&
    wallet === currentWallet &&
    dcaProviderSelect.value === currentProvider &&
    dcaProvidersById.has(currentProvider);

  if (!silent) {
    setButtonLoading(btnDcaRefresh, true);
  }

  try {
    const page = await currentWallet.dca().getOrders({
      provider: currentProvider,
      size: DCA_ORDER_PAGE_SIZE,
    });
    if (!isCurrentRequest()) {
      return;
    }

    renderDcaOrders(page.content);
    if (!silent) {
      log(
        `Loaded ${page.content.length} ${currentProvider.toUpperCase()} DCA orders`,
        "success"
      );
    }
  } catch (err) {
    if (!isCurrentRequest()) {
      return;
    }

    renderEmptyDcaOrders("Unable to load DCA orders right now.");
    if (!silent) {
      log(`DCA order refresh failed: ${err}`, "error");
    }
  } finally {
    if (isCurrentRequest()) {
      if (!silent) {
        setButtonLoading(btnDcaRefresh, false, "Refresh Orders");
      }
      updateDcaButtons();
    }
  }
}

// Logging
function log(
  message: string,
  type: "info" | "success" | "error" | "default" = "default"
) {
  const time = new Date().toLocaleTimeString("en-US", { hour12: false });
  const entry = document.createElement("div");
  entry.className = `log-entry ${type}`;
  const timeSpan = document.createElement("span");
  timeSpan.className = "log-time";
  timeSpan.textContent = time;
  entry.appendChild(timeSpan);
  entry.appendChild(document.createTextNode(message));
  logContainer.appendChild(entry);
  logContainer.scrollTop = logContainer.scrollHeight;
}

// Bridge rendering
function renderBridge(): void {
  if (!bridgeController) return;
  const s = bridgeController.getState();

  // Direction button
  const selectedChain = s.selectedToken?.chain ?? "External";
  bridgeDirectionBtn.innerHTML =
    s.direction === "to-starknet"
      ? `${selectedChain} &rarr; Starknet`
      : `Starknet &rarr; ${selectedChain}`;

  // External wallet addresses
  const ethAddr = s.connectedEthWallet?.address;
  const solAddr = s.connectedSolWallet?.address;
  const parts: string[] = [];
  if (ethAddr) parts.push(`ETH: ${ethAddr.slice(0, 6)}...${ethAddr.slice(-4)}`);
  if (solAddr) parts.push(`SOL: ${solAddr.slice(0, 4)}...${solAddr.slice(-4)}`);

  if (parts.length > 0) {
    bridgeEthAddress.textContent = parts.join(" | ");
    bridgeEthAddress.title = [ethAddr, solAddr].filter(Boolean).join(" / ");
    btnAppkitConnect.textContent = "Change Wallet";
  } else {
    bridgeEthAddress.textContent = "";
    bridgeEthAddress.title = "";
    btnAppkitConnect.textContent = "Connect Wallet";
  }

  // Populate token select
  const currentValue = bridgeTokenSelect.value;
  bridgeTokenSelect.innerHTML = '<option value="">Select a token...</option>';
  for (const token of s.tokens) {
    const opt = document.createElement("option");
    opt.value = token.id;
    const protocolTag = formatProtocolTag(token.protocol);
    opt.textContent = `${protocolTag} ${token.symbol} (${token.name})`;
    bridgeTokenSelect.appendChild(opt);
  }
  if (s.selectedToken && s.tokens.some((t) => t.id === s.selectedToken!.id)) {
    bridgeTokenSelect.value = s.selectedToken.id;
  } else if (currentValue) {
    bridgeTokenSelect.value = currentValue;
  }

  // Starknet balance
  if (s.starknetBalanceLoading) {
    bridgeStarknetBalanceEl.textContent = "Loading...";
    bridgeStarknetBalanceEl.classList.add("loading");
  } else {
    bridgeStarknetBalanceEl.textContent = s.starknetBalance ?? "—";
    bridgeStarknetBalanceEl.classList.remove("loading");
  }

  // External chain balance
  const chainLabel = s.selectedToken?.chain ?? "Ethereum";
  bridgeExternalBalanceLabel.textContent = `${chainLabel} Balance`;
  if (s.externalBalanceLoading) {
    bridgeExternalBalanceEl.textContent = "Loading...";
    bridgeExternalBalanceEl.classList.add("loading");
  } else {
    bridgeExternalBalanceEl.textContent = s.externalBalance ?? "—";
    bridgeExternalBalanceEl.classList.remove("loading");
  }

  // Refresh button
  btnBridgeRefresh.disabled = s.refreshing || !s.selectedToken;

  // Allowance (not applicable for Solana tokens)
  const showAllowance =
    s.direction === "to-starknet" &&
    s.selectedToken?.chain !== ExternalChain.SOLANA;
  if (showAllowance) {
    bridgeAllowanceRow.classList.remove("hidden");
    if (s.allowanceLoading) {
      bridgeAllowanceEl.textContent = "Loading...";
      bridgeAllowanceEl.classList.add("loading");
    } else {
      bridgeAllowanceEl.textContent = s.allowance ?? "—";
      bridgeAllowanceEl.classList.remove("loading");
    }
  } else {
    bridgeAllowanceRow.classList.add("hidden");
  }

  // Fast transfer toggle (CCTP only, to-starknet only)
  if (bridgeController.isCCTP() && s.direction === "to-starknet") {
    bridgeFastTransferRow.classList.remove("hidden");
    bridgeFastTransferInput.checked = s.fastTransfer;
  } else {
    bridgeFastTransferRow.classList.add("hidden");
  }

  // Fee estimate
  if (s.direction === "to-starknet" && s.selectedToken) {
    bridgeFeesSection.classList.remove("hidden");
    if (s.feeLoading) {
      bridgeFeesEl.textContent = "Estimating...";
    } else if (s.feeEstimate) {
      bridgeFeesEl.textContent = formatFeeEstimate(s.feeEstimate);
    } else {
      bridgeFeesEl.textContent = "—";
    }
  } else {
    bridgeFeesSection.classList.add("hidden");
  }

  // Deposit button
  const hasAmount = bridgeAmountInput.value.trim().length > 0;
  const hasExternalWallet =
    (s.selectedToken?.chain === ExternalChain.SOLANA &&
      s.connectedSolWallet != null) ||
    (s.selectedToken?.chain !== ExternalChain.SOLANA &&
      s.connectedEthWallet != null);
  const canDeposit =
    s.direction === "to-starknet" &&
    hasExternalWallet &&
    s.selectedToken != null &&
    hasAmount;
  btnBridgeDeposit.disabled = !canDeposit;
}

// UI State
function showConnected() {
  resetDcaRefreshButton();
  walletSection.classList.add("visible");
  const labels: Record<string, string> = {
    cartridge: "Cartridge Wallet",
    privatekey: "Private Key Wallet",
    privy: "Privy Wallet",
  };
  walletTypeLabelEl.textContent =
    labels[walletType || ""] || "Connected Wallet";
  populateDcaProviders();
  updateSwapButtons();

  if (bridgeController && wallet) {
    bridgeSection.classList.remove("hidden");
    bridgeController.setStarknetWallet(wallet);
  }
  updateDcaButtons();
}

function showDisconnected() {
  resetDcaRefreshButton();
  walletSection.classList.remove("visible");
  pkForm.classList.add("hidden");
  privyForm.classList.add("hidden");
  wallet = null;
  walletType = null;
  clearSwapQuote();
  populateDcaProviders();
  clearDcaPreview();
  renderEmptyDcaOrders("Connect a wallet to load DCA orders.");
  updateSwapButtons();

  bridgeSection.classList.add("hidden");
  if (bridgeController) {
    bridgeController.setStarknetWallet(null);
  }
  updateDcaButtons();
}

function setStatus(status: "deployed" | "not-deployed" | "checking") {
  walletStatusEl.className = `status-badge status-${status === "not-deployed" ? "not-deployed" : status}`;
  walletStatusEl.textContent =
    status === "deployed"
      ? "Deployed"
      : status === "not-deployed"
        ? "Not Deployed"
        : "Checking...";
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function setButtonLoading(
  btn: HTMLButtonElement,
  loading: boolean,
  originalText?: string
) {
  if (loading) {
    btn.disabled = true;
    btn.dataset.originalText = btn.textContent || "";
    btn.innerHTML = '<span class="spinner"></span>';
  } else {
    btn.disabled = false;
    btn.textContent = originalText || btn.dataset.originalText || "";
  }
}

// Check deployment status
async function checkDeploymentStatus() {
  if (!wallet) return;

  setStatus("checking");
  try {
    const deployed = await wallet.isDeployed();
    setStatus(deployed ? "deployed" : "not-deployed");
    log(
      `Account is ${deployed ? "deployed ✓" : "not deployed"}`,
      deployed ? "success" : "info"
    );
  } catch (err) {
    log(`Failed to check status: ${err}`, "error");
    setStatus("not-deployed");
  }
}

// Connect with Cartridge
async function connectCartridge() {
  setButtonLoading(btnCartridge, true);
  log("Connecting to Cartridge Controller...", "info");

  try {
    const onboard = await sdk.onboard({
      strategy: OnboardStrategy.Cartridge,
      deploy: "never",
      cartridge: { policies: [DUMMY_POLICY] },
      swapProviders,
      defaultSwapProviderId: swapProviders[0]?.id,
      dcaProviders,
      defaultDcaProviderId: dcaProviders[0]?.id,
    });
    wallet = onboard.wallet;
    walletType = "cartridge";
    registerWalletSwapProviders(wallet);

    walletAddressEl.textContent = truncateAddress(wallet.address);
    walletAddressEl.title = wallet.address;

    log(`Connected: ${truncateAddress(wallet.address)}`, "success");
    showConnected();
    await checkDeploymentStatus();
    await refreshDcaOrders(true);
  } catch (err) {
    log(`Cartridge connection failed: ${err}`, "error");
    log("Check if popups are blocked (look for icon in URL bar)", "info");
  } finally {
    setButtonLoading(btnCartridge, false, "Cartridge");
  }
}

// Connect with Private Key
async function connectPrivateKey() {
  const privateKey = privateKeyInput.value.trim();
  if (!privateKey) {
    log("Please enter a private key", "error");
    return;
  }

  const presetKey = accountPresetSelect.value;
  const preset = presets[presetKey];
  if (!preset) {
    throw new Error("Please enter a valid preset");
  }

  setButtonLoading(btnConnectPk, true);
  log(`Connecting with ${presetKey} account...`, "info");

  try {
    const signer = new StarkSigner(privateKey);
    const onboard = await sdk.onboard({
      strategy: OnboardStrategy.Signer,
      deploy: "never",
      account: { signer },
      accountPreset: preset,
      swapProviders,
      defaultSwapProviderId: swapProviders[0]?.id,
      dcaProviders,
      defaultDcaProviderId: dcaProviders[0]?.id,
    });
    wallet = onboard.wallet;
    walletType = "privatekey";
    registerWalletSwapProviders(wallet);

    walletAddressEl.textContent = truncateAddress(wallet.address);
    walletAddressEl.title = wallet.address;

    log(`Connected: ${truncateAddress(wallet.address)}`, "success");
    log(`Full address: ${wallet.address}`, "info");

    // Show public key for debugging
    const pubKey = await signer.getPubKey();
    log(`Public key: ${truncateAddress(pubKey)}`, "info");

    log("Click 📋 to copy address, then fund it with STRK", "info");
    showConnected();
    await checkDeploymentStatus();
    await refreshDcaOrders(true);
  } catch (err) {
    log(`Connection failed: ${err}`, "error");
  } finally {
    setButtonLoading(btnConnectPk, false, "Connect");
  }
}

// Connect with Privy
async function connectPrivy() {
  const email = privyEmailInput.value.trim();
  if (!email) {
    log("Please enter an email address", "error");
    return;
  }

  // Basic email validation
  if (!email.includes("@")) {
    log("Please enter a valid email address", "error");
    return;
  }

  setButtonLoading(btnConnectPrivy, true);
  log(`Connecting with Privy (${email})...`, "info");

  try {
    // First, check if server is running
    const healthRes = await fetch(`${PRIVY_SERVER_URL}/api/health`);
    if (!healthRes.ok) {
      throw new Error(
        "Privy server not running. Start it with: npm run dev:server"
      );
    }

    // Register user or get existing wallet
    log("Registering/fetching user...", "info");
    const registerRes = await fetch(`${PRIVY_SERVER_URL}/api/wallet/starknet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (!registerRes.ok) {
      const err = await registerRes.json();
      throw new Error(err.details || err.error || "Failed to register user");
    }

    const { isNew, wallet: walletData } = await registerRes.json();
    log(`${isNew ? "Created new" : "Found existing"} Privy wallet`, "info");
    log(`Privy address: ${walletData.address}`, "info");
    log(`Privy public key: ${walletData.publicKey}`, "info");

    // Use selected account preset from Privy dropdown
    const presetKey = privyAccountPresetSelect.value;
    const preset = presets[presetKey];
    if (!preset) {
      throw new Error("Please enter a valid preset");
    }
    log(`Using account preset: ${presetKey}`, "info");

    const onboard = await sdk.onboard({
      strategy: OnboardStrategy.Privy,
      deploy: "never",
      accountPreset: preset,
      swapProviders,
      defaultSwapProviderId: swapProviders[0]?.id,
      dcaProviders,
      defaultDcaProviderId: dcaProviders[0]?.id,
      privy: {
        resolve: async () => ({
          walletId: walletData.id,
          publicKey: walletData.publicKey,
          serverUrl: `${PRIVY_SERVER_URL}/api/wallet/sign`,
        }),
      },
    });
    wallet = onboard.wallet;
    walletType = "privy";
    registerWalletSwapProviders(wallet);

    log(`Wallet address: ${wallet.address}`, "info");

    walletAddressEl.textContent = truncateAddress(wallet.address);
    walletAddressEl.title = wallet.address;

    log(`Connected: ${truncateAddress(wallet.address)}`, "success");
    showConnected();
    await checkDeploymentStatus();
    await refreshDcaOrders(true);
  } catch (err) {
    log(`Privy connection failed: ${err}`, "error");
    if (String(err).includes("server not running")) {
      log(
        "Run: PRIVY_APP_ID=xxx PRIVY_APP_SECRET=xxx npm run dev:server",
        "info"
      );
    }
  } finally {
    setButtonLoading(btnConnectPrivy, false, "Connect");
  }
}

// Test transfer (send 0 STRK to self)
async function testTransfer() {
  if (!wallet) return;

  setButtonLoading(btnTransfer, true);
  log("Executing test transfer (0 STRK to self)...", "info");

  try {
    // First check if deployed
    const deployed = await wallet.isDeployed();
    if (!deployed) {
      log("Account not deployed - deploy first!", "error");
      return;
    }

    // STRK contract on Sepolia
    const STRK_CONTRACT =
      "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

    // Transfer 0 STRK to self (safe test)
    const tx = await wallet.execute([
      {
        contractAddress: STRK_CONTRACT,
        entrypoint: "transfer",
        calldata: [wallet.address, "0", "0"], // recipient, amount_low, amount_high
      },
    ]);

    log(`Tx submitted: ${truncateAddress(tx.hash)}`, "success");
    log("Waiting for confirmation...", "info");

    await tx.wait();
    log("Transfer confirmed!", "success");

    if (tx.explorerUrl) {
      log(`Explorer: ${tx.explorerUrl}`, "info");
    }
  } catch (err) {
    log(`Transfer failed: ${err}`, "error");
  } finally {
    setButtonLoading(btnTransfer, false, "Test Transfer");
  }
}

// Sponsored transfer (gasless)
async function testSponsoredTransfer() {
  if (!wallet) return;

  setButtonLoading(btnTransferSponsored, true);
  log("Executing sponsored transfer (gasless)...", "info");

  try {
    const deployed = await wallet.isDeployed();
    if (!deployed) {
      log("Account not deployed - deploy first!", "error");
      return;
    }

    const STRK_CONTRACT =
      "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

    // Execute with sponsored fee mode
    const tx = await wallet.execute(
      [
        {
          contractAddress: STRK_CONTRACT,
          entrypoint: "transfer",
          calldata: [wallet.address, "0", "0"],
        },
      ],
      { feeMode: "sponsored" }
    );

    log(`Sponsored tx submitted: ${truncateAddress(tx.hash)}`, "success");
    log("Gas paid by paymaster!", "info");
    log("Waiting for confirmation...", "info");

    await tx.wait();
    log("Sponsored transfer confirmed!", "success");

    if (tx.explorerUrl) {
      log(`Explorer: ${tx.explorerUrl}`, "info");
    }
  } catch (err) {
    log(`Sponsored tx failed: ${err}`, "error");
    log("Paymaster may not support this account/network", "info");
  } finally {
    setButtonLoading(btnTransferSponsored, false, "Sponsored Tx");
  }
}

async function fetchSwapQuote() {
  if (!wallet) {
    return;
  }

  setButtonLoading(btnSwapQuote, true);
  clearSwapQuote();

  try {
    const { providerId, tokenIn, tokenOut, amountIn, slippageBps } =
      buildSwapInput();

    log(
      `Fetching ${providerId.toUpperCase()} quote for ${amountIn.toUnit()} ${tokenIn.symbol} -> ${tokenOut.symbol}`,
      "info"
    );

    const quote = await wallet.getQuote({
      provider: providerId,
      tokenIn,
      tokenOut,
      amountIn,
      ...(slippageBps != null && { slippageBps }),
    });

    renderSwapQuote({
      providerId: quote.provider ?? providerId,
      amountIn,
      tokenOut,
      amountOutBase: quote.amountOutBase,
      routeCallCount: quote.routeCallCount,
      priceImpactBps: quote.priceImpactBps,
    });
    log(
      `Quote received: ${Amount.fromRaw(quote.amountOutBase, tokenOut.decimals, tokenOut.symbol).toFormatted(true)}`,
      "success"
    );
  } catch (err) {
    log(`Swap quote failed: ${err}`, "error");
  } finally {
    setButtonLoading(btnSwapQuote, false, "Get Quote");
    updateSwapButtons();
  }
}

async function submitSwap() {
  if (!wallet) {
    return;
  }

  setButtonLoading(btnSwapSubmit, true);

  try {
    const deployed = await wallet.isDeployed();
    if (!deployed) {
      throw new Error("Account not deployed - deploy first");
    }

    const { providerId, tokenIn, tokenOut, amountIn, slippageBps } =
      buildSwapInput();
    const sponsor = swapSponsoredInput.checked;

    log(
      `Submitting ${providerId.toUpperCase()} swap ${amountIn.toUnit()} ${tokenIn.symbol} -> ${tokenOut.symbol}`,
      "info"
    );

    const tx = await wallet.swap(
      {
        provider: providerId,
        tokenIn,
        tokenOut,
        amountIn,
        ...(slippageBps != null && { slippageBps }),
      },
      sponsor ? { feeMode: "sponsored" } : undefined
    );

    log(`Swap submitted: ${truncateAddress(tx.hash)}`, "success");
    if (sponsor) {
      log("Swap submitted in sponsored mode", "info");
    }

    log("Waiting for swap confirmation...", "info");
    await tx.wait();
    log("Swap confirmed!", "success");
    if (tx.explorerUrl) {
      log(`Explorer: ${tx.explorerUrl}`, "info");
    }
  } catch (err) {
    log(`Swap failed: ${err}`, "error");
  } finally {
    setButtonLoading(btnSwapSubmit, false, "Submit Swap");
    updateSwapButtons();
  }
}

// Confidential (Tongo)
function getSelectedTongoToken(): Token {
  const symbol =
    tongoTokenSelect.options[tongoTokenSelect.selectedIndex]?.textContent;
  if (!symbol) {
    throw new Error("No Tongo token selected");
  }
  const token = presetTokens.find((t) => t.symbol === symbol);
  if (!token) {
    throw new Error(`Token preset not found for ${symbol}`);
  }
  return token;
}

function populateTongoTokenSelect(): void {
  tongoTokenSelect.innerHTML = "";
  for (const [symbol, address] of Object.entries(TONGO_CONTRACTS)) {
    const option = document.createElement("option");
    option.value = address;
    option.textContent = symbol;
    tongoTokenSelect.appendChild(option);
  }
}

async function initializeConfidential() {
  if (!wallet) {
    log("Connect a wallet first", "error");
    return;
  }

  // Derive the Tongo key from the wallet private key
  const walletKey = privateKeyInput.value.trim();
  if (!walletKey) {
    log(
      "Tongo requires a private-key wallet (key needed for derivation)",
      "error"
    );
    return;
  }

  const contractAddress = fromAddress(tongoTokenSelect.value);
  if (!contractAddress) {
    log("Select a token", "error");
    return;
  }

  const selectedToken =
    tongoTokenSelect.options[tongoTokenSelect.selectedIndex]?.textContent ??
    "unknown";

  setButtonLoading(btnTongoInit, true);
  log(`Initializing Tongo for ${selectedToken}...`, "info");

  try {
    const rpcProvider = new RpcProvider({ nodeUrl: RPC_URL });
    confidential = new TongoConfidential({
      privateKey: walletKey,
      contractAddress,
      provider: rpcProvider,
    });

    tongoAddressEl.textContent = confidential.address;
    tongoOpsEl.classList.remove("hidden");

    log(
      `Tongo initialized (${selectedToken}): ${confidential.address}`,
      "success"
    );
    await refreshConfidentialState();
  } catch (err) {
    log(`Tongo initialization failed: ${err}`, "error");
  } finally {
    setButtonLoading(btnTongoInit, false, "Initialize");
  }
}

async function refreshConfidentialState() {
  if (!confidential) return;

  log("Refreshing Tongo state...", "info");
  try {
    const state = await confidential.getState();
    const token = getSelectedTongoToken();

    // Convert tongo units back to human-readable ERC20 amounts
    const balanceErc20 = await confidential.toPublicUnits(state.balance);
    const pendingErc20 = await confidential.toPublicUnits(state.pending);
    const balanceDisplay = Amount.fromRaw(balanceErc20, token).toFormatted();
    const pendingDisplay = Amount.fromRaw(pendingErc20, token).toFormatted();

    tongoBalanceEl.textContent = balanceDisplay;
    tongoPendingEl.textContent = pendingDisplay;
    tongoNonceEl.textContent = state.nonce.toString();
    log(
      `State: balance=${balanceDisplay}, pending=${pendingDisplay}, nonce=${state.nonce}`,
      "success"
    );
  } catch (err) {
    log(`Failed to refresh Tongo state: ${err}`, "error");
  }
}

async function confidentialFund() {
  if (!wallet || !confidential) return;

  const rawAmount = tongoFundAmountInput.value.trim();
  if (!rawAmount) {
    log("Enter an amount to fund", "error");
    return;
  }

  setButtonLoading(btnTongoFund, true);
  log(`Funding Tongo with ${rawAmount} STRK...`, "info");

  try {
    const strkToken = getSelectedTongoToken();
    const amount = Amount.parse(rawAmount, strkToken);
    const tx = await wallet
      .tx()
      .confidentialFund(confidential, {
        amount,
        sender: wallet.address,
      })
      .send();

    log(`Fund tx submitted: ${truncateAddress(tx.hash)}`, "success");
    log("Waiting for confirmation...", "info");
    await tx.wait();
    log("Fund confirmed!", "success");
    if (tx.explorerUrl) {
      log(`Explorer: ${tx.explorerUrl}`, "info");
    }
    await refreshConfidentialState();
  } catch (err) {
    log(`Fund failed: ${err}`, "error");
  } finally {
    setButtonLoading(btnTongoFund, false, "Fund");
  }
}

async function confidentialTransfer() {
  if (!wallet || !confidential) return;

  const recipientX = tongoTransferRxInput.value.trim();
  const recipientY = tongoTransferRyInput.value.trim();
  const rawAmount = tongoTransferAmountInput.value.trim();

  if (!recipientX || !recipientY) {
    log("Enter recipient X and Y coordinates", "error");
    return;
  }
  if (!rawAmount) {
    log("Enter an amount to transfer", "error");
    return;
  }

  setButtonLoading(btnTongoTransfer, true);
  log(`Confidential transfer of ${rawAmount} STRK...`, "info");

  try {
    const strkToken = getSelectedTongoToken();
    const amount = Amount.parse(rawAmount, strkToken);
    const tx = await wallet
      .tx()
      .confidentialTransfer(confidential, {
        amount,
        to: { x: recipientX, y: recipientY },
        sender: wallet.address,
      })
      .send();

    log(`Transfer tx submitted: ${truncateAddress(tx.hash)}`, "success");
    log("Waiting for confirmation...", "info");
    await tx.wait();
    log("Confidential transfer confirmed!", "success");
    if (tx.explorerUrl) {
      log(`Explorer: ${tx.explorerUrl}`, "info");
    }
    await refreshConfidentialState();
  } catch (err) {
    log(`Confidential transfer failed: ${err}`, "error");
  } finally {
    setButtonLoading(btnTongoTransfer, false, "Transfer");
  }
}

async function confidentialWithdraw() {
  if (!wallet || !confidential) return;

  const rawAmount = tongoWithdrawAmountInput.value.trim();
  const toAddress = fromAddress(tongoWithdrawToInput.value.trim());

  if (!rawAmount) {
    log("Enter an amount to withdraw", "error");
    return;
  }
  if (!toAddress) {
    log("Enter a destination address", "error");
    return;
  }

  setButtonLoading(btnTongoWithdraw, true);
  log(
    `Withdrawing ${rawAmount} STRK to ${truncateAddress(toAddress)}...`,
    "info"
  );

  try {
    const strkToken = getSelectedTongoToken();
    const amount = Amount.parse(rawAmount, strkToken);
    const tx = await wallet
      .tx()
      .confidentialWithdraw(confidential, {
        amount,
        to: toAddress,
        sender: wallet.address,
      })
      .send();

    log(`Withdraw tx submitted: ${truncateAddress(tx.hash)}`, "success");
    log("Waiting for confirmation...", "info");
    await tx.wait();
    log("Withdrawal confirmed!", "success");
    if (tx.explorerUrl) {
      log(`Explorer: ${tx.explorerUrl}`, "info");
    }
    await refreshConfidentialState();
  } catch (err) {
    log(`Withdrawal failed: ${err}`, "error");
  } finally {
    setButtonLoading(btnTongoWithdraw, false, "Withdraw");
  }
}

async function confidentialRollover() {
  if (!wallet || !confidential) return;

  setButtonLoading(btnTongoRollover, true);
  log("Executing rollover...", "info");

  try {
    const calls = await confidential.rollover({ sender: wallet.address });
    const tx = await wallet.execute(calls);

    log(`Rollover tx submitted: ${truncateAddress(tx.hash)}`, "success");
    log("Waiting for confirmation...", "info");
    await tx.wait();
    log("Rollover confirmed!", "success");
    if (tx.explorerUrl) {
      log(`Explorer: ${tx.explorerUrl}`, "info");
    }
    await refreshConfidentialState();
  } catch (err) {
    log(`Rollover failed: ${err}`, "error");
  } finally {
    setButtonLoading(btnTongoRollover, false, "Rollover");
  }
}

async function confidentialRagequit() {
  if (!wallet || !confidential) return;

  const toAddress = fromAddress(tongoRagequitToInput.value.trim());
  if (!toAddress) {
    log("Enter a destination address for ragequit", "error");
    return;
  }

  setButtonLoading(btnTongoRagequit, true);
  log(`Ragequit to ${truncateAddress(toAddress)}...`, "info");

  try {
    const calls = await confidential.ragequit({
      to: toAddress,
      sender: wallet.address,
    });
    const tx = await wallet.execute(calls);

    log(`Ragequit tx submitted: ${truncateAddress(tx.hash)}`, "success");
    log("Waiting for confirmation...", "info");
    await tx.wait();
    log("Ragequit confirmed!", "success");
    if (tx.explorerUrl) {
      log(`Explorer: ${tx.explorerUrl}`, "info");
    }
    await refreshConfidentialState();
  } catch (err) {
    log(`Ragequit failed: ${err}`, "error");
  } finally {
    setButtonLoading(btnTongoRagequit, false, "Ragequit");
  }
}

async function fetchDcaPreview() {
  if (!wallet) {
    return;
  }

  setButtonLoading(btnDcaPreview, true);
  clearDcaPreview();

  try {
    const {
      dcaProviderId,
      previewProviderId,
      sellToken,
      buyToken,
      sellAmountPerCycle,
    } = buildDcaInput({ requirePreviewProvider: true });

    log(
      `Previewing ${previewProviderId.toUpperCase()} DCA cycle ${sellAmountPerCycle.toUnit()} ${sellToken.symbol} -> ${buyToken.symbol}`,
      "info"
    );

    const quote = await wallet.dca().previewCycle({
      swapProvider: previewProviderId,
      sellToken,
      buyToken,
      sellAmountPerCycle,
    });

    renderDcaPreview({
      dcaProviderId,
      previewProviderId: quote.provider ?? previewProviderId,
      sellAmountPerCycle,
      tokenOut: buyToken,
      amountOutBase: quote.amountOutBase,
      routeCallCount: quote.routeCallCount,
      priceImpactBps: quote.priceImpactBps,
    });
    log(
      `DCA cycle preview received: ${Amount.fromRaw(quote.amountOutBase, buyToken.decimals, buyToken.symbol).toFormatted(true)}`,
      "success"
    );
  } catch (err) {
    log(`DCA preview failed: ${err}`, "error");
  } finally {
    setButtonLoading(btnDcaPreview, false, "Preview Cycle");
    updateDcaButtons();
  }
}

async function createDcaOrder() {
  if (!wallet) {
    return;
  }

  setButtonLoading(btnDcaCreate, true);

  try {
    const deployed = await wallet.isDeployed();
    if (!deployed) {
      throw new Error("Account not deployed - deploy first");
    }

    const {
      dcaProviderId,
      previewProviderId,
      sellToken,
      buyToken,
      sellAmount,
      sellAmountPerCycle,
      frequency,
      pricingStrategy,
    } = buildDcaInput();
    const sponsor = dcaSponsoredInput.checked;
    const previewSuffix = previewProviderId
      ? `, preview ${previewProviderId.toUpperCase()}`
      : "";

    log(
      `Creating ${dcaProviderId.toUpperCase()} DCA order ${sellAmount.toUnit()} ${sellToken.symbol} total / ${sellAmountPerCycle.toUnit()} per cycle into ${buyToken.symbol} (${frequency}${previewSuffix})`,
      "info"
    );

    const tx = await wallet.dca().create(
      {
        provider: dcaProviderId,
        sellToken,
        buyToken,
        sellAmount,
        sellAmountPerCycle,
        frequency,
        ...(pricingStrategy && { pricingStrategy }),
      },
      sponsor ? { feeMode: "sponsored" } : undefined
    );

    log(`DCA create submitted: ${truncateAddress(tx.hash)}`, "success");
    if (sponsor) {
      log("DCA order submitted in sponsored mode", "info");
    }

    log("Waiting for DCA confirmation...", "info");
    await tx.wait();
    log("DCA order created!", "success");
    if (tx.explorerUrl) {
      log(`Explorer: ${tx.explorerUrl}`, "info");
    }

    await refreshDcaOrders(true);
  } catch (err) {
    log(`DCA creation failed: ${err}`, "error");
  } finally {
    setButtonLoading(btnDcaCreate, false, "Create DCA");
    updateDcaButtons();
  }
}

// Deploy account
async function deployAccount() {
  if (!wallet) return;

  setButtonLoading(btnDeploy, true);
  log("Deploying account...", "info");

  try {
    const tx = await wallet.deploy();
    log(`Deploy tx submitted: ${truncateAddress(tx.hash)}`, "info");

    log("Waiting for confirmation...", "info");
    await tx.wait();

    log("Account deployed successfully!", "success");
    await checkDeploymentStatus();
  } catch (err) {
    log(`Deployment failed: ${err}`, "error");
  } finally {
    setButtonLoading(btnDeploy, false, "Deploy Account");
  }
}

// Disconnect
function disconnect() {
  if (wallet && walletType === "cartridge" && "disconnect" in wallet) {
    (wallet as { disconnect: () => Promise<void> }).disconnect();
  }
  log("Disconnected", "info");
  showDisconnected();
  privateKeyInput.value = "";
}

// Event Listeners
btnCartridge.addEventListener("click", connectCartridge);

btnTogglePk.addEventListener("click", () => {
  pkForm.classList.toggle("hidden");
  privyForm.classList.add("hidden");
});

btnPrivy.addEventListener("click", () => {
  privyForm.classList.toggle("hidden");
  pkForm.classList.add("hidden");
});

btnConnectPk.addEventListener("click", connectPrivateKey);
btnConnectPrivy.addEventListener("click", connectPrivy);

btnCheckDeployed.addEventListener("click", async () => {
  setButtonLoading(btnCheckDeployed, true);
  await checkDeploymentStatus();
  setButtonLoading(btnCheckDeployed, false, "Check Status");
});

btnDeploy.addEventListener("click", deployAccount);
btnTransfer.addEventListener("click", testTransfer);
btnCopyAddress.addEventListener("click", async () => {
  if (!wallet) return;
  try {
    await navigator.clipboard.writeText(wallet.address);
    btnCopyAddress.textContent = "✓";
    log(`Copied: ${wallet.address}`, "success");
    setTimeout(() => {
      btnCopyAddress.textContent = "📋";
    }, 2000);
  } catch {
    log(`Address: ${wallet.address}`, "info");
  }
});
btnTransferSponsored.addEventListener("click", testSponsoredTransfer);
btnDisconnect.addEventListener("click", disconnect);
btnSwapQuote.addEventListener("click", fetchSwapQuote);
btnSwapSubmit.addEventListener("click", submitSwap);
btnDcaPreview.addEventListener("click", fetchDcaPreview);
btnDcaCreate.addEventListener("click", createDcaOrder);
btnDcaRefresh.addEventListener("click", () => {
  void refreshDcaOrders();
});

swapProviderSelect.addEventListener("change", () => {
  clearSwapQuote();
  updateSwapButtons();
});

swapTokenInSelect.addEventListener("change", () => {
  normalizeSwapTokenSelection("in");
  clearSwapQuote();
  updateSwapButtons();
});

swapTokenOutSelect.addEventListener("change", () => {
  normalizeSwapTokenSelection("out");
  clearSwapQuote();
  updateSwapButtons();
});

swapAmountInput.addEventListener("input", () => {
  clearSwapQuote();
  updateSwapButtons();
});

swapSlippageInput.addEventListener("input", () => {
  clearSwapQuote();
});

swapSponsoredInput.addEventListener("change", () => {
  updateSwapButtons();
});

dcaProviderSelect.addEventListener("change", () => {
  resetDcaRefreshButton();
  clearDcaPricingBounds();
  clearDcaPreview();
  void refreshDcaOrders(true);
  updateDcaButtons();
});

dcaPreviewProviderSelect.addEventListener("change", () => {
  clearDcaPreview();
  updateDcaButtons();
});

dcaTokenInSelect.addEventListener("change", () => {
  normalizeDcaTokenSelection("in");
  clearDcaPreview();
  updateDcaButtons();
});

dcaTokenOutSelect.addEventListener("change", () => {
  normalizeDcaTokenSelection("out");
  clearDcaPreview();
  updateDcaButtons();
});

dcaTotalAmountInput.addEventListener("input", () => {
  clearDcaPreview();
  updateDcaButtons();
});

dcaCycleAmountInput.addEventListener("input", () => {
  clearDcaPreview();
  updateDcaButtons();
});

dcaFrequencySelect.addEventListener("change", () => {
  clearDcaPreview();
});

dcaMinBuyInput.addEventListener("input", () => {
  clearDcaPreview();
});

dcaMaxBuyInput.addEventListener("input", () => {
  clearDcaPreview();
});

dcaSponsoredInput.addEventListener("change", () => {
  updateDcaButtons();
});

// Allow Enter key to submit private key form
privateKeyInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    connectPrivateKey();
  }
});

// Generate random private key
btnGenerateKey.addEventListener("click", () => {
  const randomBytes = ec.starkCurve.utils.randomPrivateKey();
  const privateKey =
    "0x" +
    Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  privateKeyInput.value = privateKey;
  privateKeyInput.type = "text"; // Show it so user can see/copy it
  log("Generated random private key (shown above)", "success");
  log("This is a NEW account - fund it before deploying", "info");
});

// Bridge Event Listeners
btnBridgeRefresh.addEventListener("click", () => {
  bridgeController?.refresh();
});

btnAppkitConnect.addEventListener("click", () => {
  if (appKit) {
    appKit.open();
  }
});

bridgeDirectionBtn.addEventListener("click", () => {
  bridgeController?.toggleDirection();
});

bridgeTokenSelect.addEventListener("change", () => {
  bridgeController?.selectToken(bridgeTokenSelect.value || null);
});

bridgeFastTransferInput.addEventListener("change", () => {
  bridgeController?.setFastTransfer(bridgeFastTransferInput.checked);
});

bridgeAmountInput.addEventListener("input", () => {
  renderBridge();
});

btnBridgeDeposit.addEventListener("click", () => {
  const amount = bridgeAmountInput.value.trim();
  if (amount && bridgeController) {
    bridgeController.deposit(amount);
  }
});

// Subscribe to AppKit account and network changes.
// Account and network are separate subscriptions; we store latest
// values and reconcile in shared sync functions.
let appKitEthProvider: Eip1193Provider | null = null;
let appKitSolSigner: SolanaProvider | null = null;

async function syncEthWalletFromAppKit(): Promise<void> {
  if (!bridgeController || !appKit) return;

  const address = appKit.getAddress("eip155");
  const chainId = appKit.getChainId();
  const isConnected = appKit.getIsConnectedState();

  if (isConnected && address && chainId && appKitEthProvider) {
    await bridgeController.connectEthereumWallet(
      appKitEthProvider,
      address,
      String(chainId)
    );
  } else if (!isConnected || !appKitEthProvider) {
    bridgeController.disconnectEthWallet();
  }
}

async function syncSolWalletFromAppKit(): Promise<void> {
  if (!bridgeController || !appKit) return;

  const address = appKit.getAddress("solana");
  const chainId = appKit.getChainId();
  const isConnected = appKit.getIsConnectedState();

  if (isConnected && address && chainId && appKitSolSigner) {
    await bridgeController.connectSolanaWallet(
      appKitSolSigner,
      address,
      String(chainId)
    );
  } else if (!isConnected || !appKitSolSigner) {
    bridgeController.disconnectSolWallet();
  }
}

async function syncWalletsFromAppKit(): Promise<void> {
  await syncEthWalletFromAppKit();
  await syncSolWalletFromAppKit();
}

if (appKit) {
  appKit.subscribeProviders((providers) => {
    appKitEthProvider = providers["eip155"] as Eip1193Provider | null;
    appKitSolSigner = providers["solana"] as SolanaProvider | null;
    void syncWalletsFromAppKit();
  });

  appKit.subscribeAccount(() => {
    void syncWalletsFromAppKit();
  });

  appKit.subscribeNetwork(() => {
    void syncWalletsFromAppKit();
  });
}

// Auto-connect with private key from env vars
async function autoConnect(): Promise<void> {
  if (!AUTO_PRIVATE_KEY) return;

  const presetKey = AUTO_ACCOUNT_PRESET ?? "openzeppelin";
  const preset = presets[presetKey];
  if (!preset) {
    log(`Invalid VITE_ACCOUNT_PRESET: "${presetKey}"`, "error");
    return;
  }

  log(`Auto-connecting with ${presetKey} account...`, "info");

  try {
    const signer = new StarkSigner(AUTO_PRIVATE_KEY);
    const onboard = await sdk.onboard({
      strategy: OnboardStrategy.Signer,
      deploy: "never",
      account: { signer },
      accountPreset: preset,
    });
    wallet = onboard.wallet;
    walletType = "privatekey";
    registerWalletSwapProviders(wallet);

    walletAddressEl.textContent = truncateAddress(wallet.address);
    walletAddressEl.title = wallet.address;

    log(`Auto-connected: ${truncateAddress(wallet.address)}`, "success");
    showConnected();
    await checkDeploymentStatus();
  } catch (err) {
    log(`Auto-connect failed: ${err}`, "error");
  }
}

// Tongo event listeners
btnTongoInit.addEventListener("click", initializeConfidential);
btnTongoFund.addEventListener("click", confidentialFund);
btnTongoTransfer.addEventListener("click", confidentialTransfer);
btnTongoWithdraw.addEventListener("click", confidentialWithdraw);
btnTongoRollover.addEventListener("click", confidentialRollover);
btnTongoRagequit.addEventListener("click", confidentialRagequit);
btnTongoRefresh.addEventListener("click", async () => {
  setButtonLoading(btnTongoRefresh, true);
  await refreshConfidentialState();
  setButtonLoading(btnTongoRefresh, false, "Refresh State");
});

// Initial log
initializeSwapForm();
populateTongoTokenSelect();
initializeDcaForm();
log(`SDK initialized on ${NETWORK} with RPC: ${RPC_URL}`, "info");
if (REOWN_PROJECT_ID) {
  log("Bridge enabled (Reown AppKit)", "info");
}
autoConnect();
