import {
  StarkZap,
  OnboardStrategy,
  ChainId,
  getPresets,
  type WalletInterface,
  Amount,
} from "starkzap";

// ============================================================================
// Configuration
// ============================================================================

const RPC_URL = "https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_9";
const SDK_CHAIN_ID = ChainId.SEPOLIA;

// Initialize SDK
const sdk = new StarkZap({
  rpcUrl: RPC_URL,
  chainId: SDK_CHAIN_ID,
});

// Token presets
const presetTokens = Object.values(getPresets(SDK_CHAIN_ID)).sort((a, b) =>
  a.symbol.localeCompare(b.symbol)
);

// ============================================================================
// State
// ============================================================================

let wallet: WalletInterface | null = null;
let walletType: string | null = null;
let isRefreshing = false;

// Recent transactions (simulated for demo)
const recentTxs: Array<{
  type: string;
  amount: string;
  time: string;
  status: "confirmed" | "pending";
  hash: string;
}> = [];

// ============================================================================
// DOM Elements
// ============================================================================

const elements = {
  // Connection
  connectButtons: document.getElementById("connect-buttons")!,
  btnCartridge: document.getElementById("btn-cartridge") as HTMLButtonElement,
  btnArgent: document.getElementById("btn-argent") as HTMLButtonElement,
  btnBraavos: document.getElementById("btn-braavos") as HTMLButtonElement,

  // Wallet Info
  walletInfo: document.getElementById("wallet-info")!,
  walletAddress: document.getElementById("wallet-address")!,
  walletStatus: document.getElementById("wallet-status")!,
  walletNetwork: document.getElementById("wallet-network")!,
  walletType: document.getElementById("wallet-type")!,
  btnCopy: document.getElementById("btn-copy") as HTMLButtonElement,
  btnDisconnect: document.getElementById("btn-disconnect") as HTMLButtonElement,

  // Stats
  statBalance: document.getElementById("stat-balance")!,
  statStaked: document.getElementById("stat-staked")!,
  statTx: document.getElementById("stat-tx")!,
  statGas: document.getElementById("stat-gas")!,

  // Tabs
  tabs: document.querySelectorAll(".tab"),
  tabContents: {
    balances: document.getElementById("tab-balances")!,
    staking: document.getElementById("tab-staking")!,
    activity: document.getElementById("tab-activity")!,
  },

  // Lists
  tokenList: document.getElementById("token-list")!,
  stakingList: document.getElementById("staking-list")!,
  activityList: document.getElementById("activity-list")!,

  // Refresh buttons
  btnRefreshBalances: document.getElementById(
    "btn-refresh-balances"
  ) as HTMLButtonElement,
  btnRefreshStaking: document.getElementById(
    "btn-refresh-staking"
  ) as HTMLButtonElement,
  btnRefreshActivity: document.getElementById(
    "btn-refresh-activity"
  ) as HTMLButtonElement,
};

// ============================================================================
// Utility Functions
// ============================================================================

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatBalance(amount: Amount | null): string {
  if (!amount) return "0";
  return amount.toFormatted(true);
}

function getTokenColor(symbol: string): string {
  const colors: Record<string, string> = {
    STRK: "linear-gradient(135deg, #2962FF 0%, #1565C0 100%)",
    ETH: "linear-gradient(135deg, #627EEA 0%, #4A5FDC 100%)",
    USDC: "linear-gradient(135deg, #2775CA 0%, #1E5FAA 100%)",
    USDT: "linear-gradient(135deg, #26A17B 0%, #1E8A65 100%)",
    WBTC: "linear-gradient(135deg, #F7931A 0%, #D4790F 100%)",
  };
  return colors[symbol] || "linear-gradient(135deg, #666 0%, #444 100%)";
}

function setButtonLoading(btn: HTMLButtonElement, loading: boolean): void {
  if (loading) {
    btn.disabled = true;
    btn.dataset.originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span>';
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.originalText || "";
  }
}

// ============================================================================
// UI Update Functions
// ============================================================================

function showWalletInfo(): void {
  elements.connectButtons.classList.add("hidden");
  elements.walletInfo.classList.add("visible");

  if (wallet) {
    elements.walletAddress.textContent = truncateAddress(wallet.address);
    elements.walletAddress.title = wallet.address;
    elements.walletNetwork.textContent = SDK_CHAIN_ID.isMainnet()
      ? "Mainnet"
      : "Sepolia";
    elements.walletType.textContent = walletType || "Unknown";
  }
}

function hideWalletInfo(): void {
  elements.connectButtons.classList.remove("hidden");
  elements.walletInfo.classList.remove("visible");
}

async function checkDeploymentStatus(): Promise<boolean> {
  if (!wallet) return false;

  elements.walletStatus.textContent = "Checking...";
  elements.walletStatus.className = "status-value status-checking";

  try {
    const deployed = await wallet.isDeployed();
    elements.walletStatus.textContent = deployed ? "Deployed" : "Not Deployed";
    elements.walletStatus.className = `status-value status-${
      deployed ? "deployed" : "not-deployed"
    }`;
    return deployed;
  } catch {
    elements.walletStatus.textContent = "Error";
    elements.walletStatus.className = "status-value status-not-deployed";
    return false;
  }
}

// ============================================================================
// Token Balances
// ============================================================================

function renderEmptyBalances(): void {
  elements.tokenList.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">💳</div>
      <div class="empty-title">No wallet connected</div>
      <div class="empty-desc">Connect your wallet to view balances</div>
    </div>
  `;
}

function renderLoadingBalances(): void {
  elements.tokenList.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon"><span class="spinner"></span></div>
      <div class="empty-title">Loading balances...</div>
    </div>
  `;
}

function renderTokenBalances(balances: Map<string, Amount>): void {
  if (balances.size === 0) {
    elements.tokenList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">💸</div>
        <div class="empty-title">No token balances found</div>
        <div class="empty-desc">Fund your wallet to see balances here</div>
      </div>
    `;
    return;
  }

  let html = "";
  let totalValue = 0;

  // Sort tokens by balance (largest first)
  const sortedTokens = [...presetTokens].sort((a, b) => {
    const balA = balances.get(a.address);
    const balB = balances.get(b.address);
    const valA = balA ? Number(balA.toUnit()) : 0;
    const valB = balB ? Number(balB.toUnit()) : 0;
    return valB - valA;
  });

  for (const token of sortedTokens) {
    const balance = balances.get(token.address);
    if (!balance || balance.toBase() === 0n) continue;

    const formatted = formatBalance(balance);
    const symbol = token.symbol;

    // Mock USD values for demo (in production, you'd fetch prices)
    const mockPrices: Record<string, number> = {
      STRK: 0.5,
      ETH: 2500,
      USDC: 1,
      USDT: 1,
      WBTC: 45000,
    };
    const price = mockPrices[symbol] || 0;
    const value = Number(balance.toUnit()) * price;
    totalValue += value;

    html += `
      <div class="token-item">
        <div class="token-left">
          <div class="token-icon" style="background: ${getTokenColor(symbol)}">
            ${symbol.slice(0, 2)}
          </div>
          <div>
            <div class="token-name">${token.name}</div>
            <div class="token-symbol">${symbol}</div>
          </div>
        </div>
        <div class="token-balance">
          <div class="token-amount">${formatted}</div>
          <div class="token-value">$${value.toFixed(2)}</div>
        </div>
      </div>
    `;
  }

  elements.tokenList.innerHTML =
    html ||
    `
    <div class="empty-state">
      <div class="empty-icon">💸</div>
      <div class="empty-title">No token balances</div>
      <div class="empty-desc">Fund your wallet to see balances here</div>
    </div>
  `;

  // Update total balance stat
  elements.statBalance.textContent = `$${totalValue.toFixed(2)}`;
}

async function fetchBalances(): Promise<void> {
  if (!wallet || isRefreshing) return;

  isRefreshing = true;
  renderLoadingBalances();

  try {
    const balances = new Map<string, Amount>();

    // Fetch all token balances in parallel
    const promises = presetTokens.map(async (token) => {
      try {
        const balance = await wallet!.balanceOf(token);
        return { address: token.address, balance };
      } catch {
        return null;
      }
    });

    const results = await Promise.all(promises);
    for (const result of results) {
      if (result && result.balance.toBase() > 0n) {
        balances.set(result.address, result.balance);
      }
    }

    renderTokenBalances(balances);
  } catch (error) {
    console.error("Failed to fetch balances:", error);
    renderEmptyBalances();
  } finally {
    isRefreshing = false;
  }
}

// ============================================================================
// Staking Positions
// ============================================================================

function renderEmptyStaking(): void {
  elements.stakingList.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">🔒</div>
      <div class="empty-title">No staking positions</div>
      <div class="empty-desc">Stake STRK to earn rewards</div>
    </div>
  `;
}

function renderStakingPositions(
  positions: Array<{
    validator: string;
    staked: string;
    rewards: string;
    apy: number;
  }>
): void {
  if (positions.length === 0) {
    renderEmptyStaking();
    return;
  }

  let html = '<div class="staking-grid">';
  let totalStaked = 0;

  for (const pos of positions) {
    totalStaked += parseFloat(pos.staked);

    html += `
      <div class="staking-card">
        <div class="staking-header">
          <div class="validator-info">
            <div class="validator-avatar">${pos.validator.slice(0, 2)}</div>
            <span class="validator-name">${truncateAddress(pos.validator)}</span>
          </div>
          <span class="apy-badge">${pos.apy}% APY</span>
        </div>
        <div class="staking-stats">
          <div class="staking-stat">
            <div class="staking-stat-label">Staked</div>
            <div class="staking-stat-value">${pos.staked} STRK</div>
          </div>
          <div class="staking-stat">
            <div class="staking-stat-label">Rewards</div>
            <div class="staking-stat-value">${pos.rewards} STRK</div>
          </div>
        </div>
      </div>
    `;
  }

  html += "</div>";
  elements.stakingList.innerHTML = html;

  // Update staked stat
  elements.statStaked.textContent = `${totalStaked.toFixed(2)} STRK`;
}

async function fetchStakingPositions(): Promise<void> {
  if (!wallet || isRefreshing) return;

  try {
    // In a real implementation, you would fetch staking positions from the staking contract
    // For demo, we show empty state using renderStakingPositions with empty array
    const positions: Array<{
      validator: string;
      staked: string;
      rewards: string;
      apy: number;
    }> = [];
    renderStakingPositions(positions);

    // Update APY stat
    document.getElementById("stat-apy")!.textContent = "~10% APY";
  } catch (error) {
    console.error("Failed to fetch staking positions:", error);
    renderEmptyStaking();
  }
}

// ============================================================================
// Activity / Transactions
// ============================================================================

function renderEmptyActivity(): void {
  elements.activityList.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">📝</div>
      <div class="empty-title">No recent activity</div>
      <div class="empty-desc">Transactions will appear here</div>
    </div>
  `;
}

function renderActivity(): void {
  if (recentTxs.length === 0) {
    renderEmptyActivity();
    return;
  }

  let html = "";
  for (const tx of recentTxs) {
    const iconClass = tx.type.toLowerCase().includes("stake")
      ? "stake"
      : tx.type.toLowerCase().includes("swap")
        ? "swap"
        : "transfer";

    html += `
      <div class="tx-item">
        <div class="tx-left">
          <div class="tx-icon ${iconClass}">
            ${iconClass === "stake" ? "🔒" : iconClass === "swap" ? "🔄" : "📤"}
          </div>
          <div>
            <div class="tx-type">${tx.type}</div>
            <div class="tx-time">${tx.time}</div>
          </div>
        </div>
        <div class="tx-right">
          <div class="tx-amount">${tx.amount}</div>
          <div class="tx-status ${tx.status}">${tx.status}</div>
        </div>
      </div>
    `;
  }

  elements.activityList.innerHTML = html;

  // Update tx count stat
  elements.statTx.textContent = recentTxs.length.toString();
  const pending = recentTxs.filter((tx) => tx.status === "pending").length;
  document.getElementById("stat-tx-pending")!.textContent =
    pending > 0 ? `${pending} pending` : "All confirmed";
}

// ============================================================================
// Tab Navigation
// ============================================================================

function setupTabs(): void {
  elements.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      // Update active tab
      elements.tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      // Show corresponding content
      const tabName = tab.getAttribute(
        "data-tab"
      ) as keyof typeof elements.tabContents;
      Object.values(elements.tabContents).forEach((content) =>
        content.classList.add("hidden")
      );
      elements.tabContents[tabName].classList.remove("hidden");
    });
  });
}

// ============================================================================
// Wallet Connection
// ============================================================================

async function connectCartridge(): Promise<void> {
  setButtonLoading(elements.btnCartridge, true);

  try {
    const onboard = await sdk.onboard({
      strategy: OnboardStrategy.Cartridge,
      deploy: "never",
      cartridge: {
        policies: [
          {
            target:
              "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
            method: "transfer",
          },
        ],
      },
    });

    wallet = onboard.wallet;
    walletType = "Cartridge";
    showWalletInfo();
    await checkDeploymentStatus();
    await refreshAllData();

    // Add to activity
    addActivity("Wallet Connected", "Cartridge Controller", "confirmed");
  } catch (error) {
    console.error("Cartridge connection failed:", error);
    alert(
      "Failed to connect Cartridge wallet. Make sure popups are not blocked."
    );
  } finally {
    setButtonLoading(elements.btnCartridge, false);
  }
}

async function connectArgentX(): Promise<void> {
  // For browser extension wallets like Argent X, we need to use starknet.js directly
  // This is a simplified version - full implementation would use window.starknet
  alert(
    "Argent X connection requires the browser extension.\n\n" +
      "Full implementation would use window.starknet from the extension.\n" +
      "For this demo, use Cartridge wallet or see the web example for full extension support."
  );
}

async function connectBraavos(): Promise<void> {
  alert(
    "Braavos connection requires the browser extension.\n\n" +
      "Full implementation would use window.starknet_braavos from the extension.\n" +
      "For this demo, use Cartridge wallet or see the web example for full extension support."
  );
}

function disconnect(): void {
  if (
    wallet &&
    "disconnect" in wallet &&
    typeof wallet.disconnect === "function"
  ) {
    wallet.disconnect();
  }

  wallet = null;
  walletType = null;
  hideWalletInfo();
  renderEmptyBalances();
  renderEmptyStaking();
  renderEmptyActivity();
  elements.statBalance.textContent = "$0.00";
  elements.statStaked.textContent = "0 STRK";
  elements.statTx.textContent = "0";
}

// ============================================================================
// Helper Functions
// ============================================================================

function addActivity(
  type: string,
  amount: string,
  status: "confirmed" | "pending"
): void {
  recentTxs.unshift({
    type,
    amount,
    time: new Date().toLocaleString(),
    status,
    hash: "",
  });

  // Keep only last 20 transactions
  if (recentTxs.length > 20) {
    recentTxs.pop();
  }

  renderActivity();
}

async function refreshAllData(): Promise<void> {
  if (!wallet) return;

  await Promise.all([fetchBalances(), fetchStakingPositions()]);
  renderActivity();
}

// ============================================================================
// Event Listeners
// ============================================================================

function setupEventListeners(): void {
  // Connection buttons
  elements.btnCartridge.addEventListener("click", connectCartridge);
  elements.btnArgent.addEventListener("click", connectArgentX);
  elements.btnBraavos.addEventListener("click", connectBraavos);

  // Wallet actions
  elements.btnCopy.addEventListener("click", async () => {
    if (!wallet) return;
    try {
      await navigator.clipboard.writeText(wallet.address);
      elements.btnCopy.innerHTML = "✓";
      setTimeout(() => {
        elements.btnCopy.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
          </svg>
        `;
      }, 2000);
    } catch {
      // Fallback
      alert(`Wallet address: ${wallet.address}`);
    }
  });

  elements.btnDisconnect.addEventListener("click", disconnect);

  // Refresh buttons
  elements.btnRefreshBalances.addEventListener("click", fetchBalances);
  elements.btnRefreshStaking.addEventListener("click", fetchStakingPositions);
  elements.btnRefreshActivity.addEventListener("click", renderActivity);
}

// ============================================================================
// Initialize
// ============================================================================

function init(): void {
  setupTabs();
  setupEventListeners();

  // Render empty states
  renderEmptyBalances();
  renderEmptyStaking();
  renderEmptyActivity();

  console.log("StarkZap Wallet Stats Dashboard initialized");
  console.log("RPC URL:", RPC_URL);
  console.log("Chain ID:", SDK_CHAIN_ID.toLiteral());
}

init();
