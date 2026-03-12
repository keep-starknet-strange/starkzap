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
  TongoConfidential,
  type WalletInterface,
  type AccountClassConfig,
  type SwapProvider,
  type Token,
} from "starkzap";
import { ec, RpcProvider } from "starknet";
import { getSwapProviders } from "./swaps";

// Configuration
const RPC_URL = "https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_9";
const PRIVY_SERVER_URL = "http://localhost:3001";
const DUMMY_POLICY = {
  target: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d", // STRK
  method: "transfer",
};
const SDK_CHAIN_ID = ChainId.SEPOLIA;
const BPS_DENOMINATOR = 10_000n;
const DEFAULT_SLIPPAGE_BPS = 100n;

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
const presetTokens = Object.values(getPresets(SDK_CHAIN_ID)).sort((a, b) =>
  a.symbol.localeCompare(b.symbol)
);

// SDK instance
const sdk = new StarkZap({
  rpcUrl: RPC_URL,
  chainId: SDK_CHAIN_ID,
});

// Current wallet
let wallet: WalletInterface | null = null;
let walletType: "cartridge" | "privatekey" | "privy" | null = null;
let confidential: TongoConfidential | null = null;

// DOM Elements
const walletSection = document.getElementById("wallet-section")!;
const pkForm = document.getElementById("pk-form")!;
const logContainer = document.getElementById("log")!;

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

function getTokenByAddress(address: string): Token | null {
  const token = presetTokens.find((item) => item.address === address);
  return token ?? null;
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

// Logging
function log(
  message: string,
  type: "info" | "success" | "error" | "default" = "default"
) {
  const time = new Date().toLocaleTimeString("en-US", { hour12: false });
  const entry = document.createElement("div");
  entry.className = `log-entry ${type}`;
  entry.innerHTML = `<span class="log-time">${time}</span>${message}`;
  logContainer.appendChild(entry);
  logContainer.scrollTop = logContainer.scrollHeight;
}

// UI State
function showConnected() {
  walletSection.classList.add("visible");
  const labels: Record<string, string> = {
    cartridge: "Cartridge Wallet",
    privatekey: "Private Key Wallet",
    privy: "Privy Wallet",
  };
  walletTypeLabelEl.textContent =
    labels[walletType || ""] || "Connected Wallet";
  updateSwapButtons();
}

function showDisconnected() {
  walletSection.classList.remove("visible");
  pkForm.classList.add("hidden");
  privyForm.classList.add("hidden");
  wallet = null;
  walletType = null;
  clearSwapQuote();
  updateSwapButtons();
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
    });
    wallet = onboard.wallet;
    walletType = "cartridge";
    registerWalletSwapProviders(wallet);

    walletAddressEl.textContent = truncateAddress(wallet.address);
    walletAddressEl.title = wallet.address;

    log(`Connected: ${truncateAddress(wallet.address)}`, "success");
    showConnected();
    await checkDeploymentStatus();
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

  const contractAddress = tongoTokenSelect.value;
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
  const toAddress = tongoWithdrawToInput.value.trim();

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

  const toAddress = tongoRagequitToInput.value.trim();
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
log(`SDK initialized with RPC: ${RPC_URL}`, "info");
