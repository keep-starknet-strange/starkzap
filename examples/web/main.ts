import {
  StarkSDK,
  StarkSigner,
  PrivySigner,
  OpenZeppelinPreset,
  ArgentPreset,
  ArgentXV050Preset,
  BraavosPreset,
  DevnetPreset,
  Amount,
  ChainId,
  fromAddress,
  sepoliaTokens,
  mainnetTokens,
  sepoliaValidators,
  mainnetValidators,
  type WalletInterface,
  type AccountClassConfig,
  type Token,
  type Validator,
  type Pool,
  type PoolMember,
} from "x";
import { ec } from "starknet";

// ─── Configuration ───────────────────────────────────────────────────────────

const PRIVY_SERVER_URL = "http://localhost:3001";

const NETWORKS = [
  {
    name: "Sepolia",
    chainId: ChainId.from("SN_SEPOLIA"),
    rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
  },
  {
    name: "Mainnet",
    chainId: ChainId.from("SN_MAIN"),
    rpcUrl: "https://api.cartridge.gg/x/starknet/mainnet",
  },
];

const STAKING_CONTRACTS: Record<string, string> = {
  SN_SEPOLIA:
    "0x03745ab04a431fc02871a139be6b93d9260b0ff3e779ad9c8b377183b23109f1",
  SN_MAIN: "0x00ca1702e64c81d9a07b86bd2c540188d92a2c73cf5cc0e508d949015e7e84a7",
};

const PRESETS: Record<string, AccountClassConfig> = {
  openzeppelin: OpenZeppelinPreset,
  argent: ArgentPreset,
  argentx050: ArgentXV050Preset,
  braavos: BraavosPreset,
  devnet: DevnetPreset,
};

// ─── State ───────────────────────────────────────────────────────────────────

let sdk: StarkSDK | null = null;
let wallet: WalletInterface | null = null;
let walletType: "cartridge" | "privatekey" | "privy" | "webauthn" | null = null;
let selectedNetwork = NETWORKS[0];
let isCustomNetwork = false;

// Balances
const balances = new Map<string, Amount>();

// Staking positions: key = "validatorKey:tokenAddress"
interface StakingPosition {
  key: string;
  validatorKey: string;
  validator: Validator;
  token: Token;
  pool: Pool;
  position: PoolMember | null;
  isMember: boolean;
}
const positions = new Map<string, StakingPosition>();

// Transfer rows
let transferRows: { id: number }[] = [];
let nextTransferId = 0;

// Currently selected staking action
let stakingActionType: "stake" | "addStake" | "exitIntent" | null = null;
let stakingActionKey: string | null = null;

// Selected validator for pool picker flow
let selectedValidatorKey: string | null = null;

// ─── DOM Elements ────────────────────────────────────────────────────────────

const $ = (id: string) => document.getElementById(id)!;
const $btn = (id: string) => $(id) as HTMLButtonElement;
const $input = (id: string) => $(id) as HTMLInputElement;
const $select = (id: string) => $(id) as HTMLSelectElement;

const networkSection = $("network-section");
const connectSection = $("connect-section");
const walletSection = $("wallet-section");
const logContainer = $("log");

// ─── Logging ─────────────────────────────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function truncate(s: string, len = 6): string {
  if (s.length <= len * 2 + 3) return s;
  return `${s.slice(0, len)}...${s.slice(-4)}`;
}

function setLoading(btn: HTMLButtonElement, loading: boolean, text?: string) {
  if (loading) {
    btn.disabled = true;
    btn.dataset.originalText = btn.textContent || "";
    btn.innerHTML = '<span class="spinner"></span>';
  } else {
    btn.disabled = false;
    btn.textContent = text || btn.dataset.originalText || "";
  }
}

function isSponsored(): boolean {
  return ($input("chk-sponsored") as HTMLInputElement).checked;
}

function getTokens(): Token[] {
  return selectedNetwork.chainId.isSepolia()
    ? Object.values(sepoliaTokens)
    : Object.values(mainnetTokens);
}

function getValidators(): Record<string, Validator> {
  return selectedNetwork.chainId.isSepolia()
    ? sepoliaValidators
    : mainnetValidators;
}

// ─── Network Selection ───────────────────────────────────────────────────────

function selectNetworkPreset(index: number) {
  selectedNetwork = NETWORKS[index];
  isCustomNetwork = false;
  // Visual selection
  $btn("btn-net-sepolia").style.borderColor =
    index === 0 ? "var(--accent-primary)" : "var(--border-color)";
  $btn("btn-net-sepolia").style.color =
    index === 0 ? "var(--accent-primary)" : "var(--text-primary)";
  $btn("btn-net-mainnet").style.borderColor =
    index === 1 ? "var(--accent-primary)" : "var(--border-color)";
  $btn("btn-net-mainnet").style.color =
    index === 1 ? "var(--accent-primary)" : "var(--text-primary)";
  $("custom-network-form").classList.add("hidden");
}

function confirmNetwork() {
  if (isCustomNetwork) {
    const rpcUrl = $input("custom-rpc").value.trim();
    const chainIdStr = $select("custom-chain").value as
      | "SN_SEPOLIA"
      | "SN_MAIN";
    if (!rpcUrl) {
      log("Please enter an RPC URL", "error");
      return;
    }
    selectedNetwork = {
      name: "Custom",
      chainId: ChainId.from(chainIdStr),
      rpcUrl,
    };
  }

  const stakingContract = STAKING_CONTRACTS[selectedNetwork.chainId.value];
  sdk = new StarkSDK({
    rpcUrl: selectedNetwork.rpcUrl,
    chainId: selectedNetwork.chainId,
    paymaster: { nodeUrl: `${PRIVY_SERVER_URL}/api/paymaster` },
    ...(stakingContract && {
      staking: { contract: fromAddress(stakingContract) },
    }),
  });

  log(
    `SDK initialized: ${selectedNetwork.name} (${selectedNetwork.chainId})`,
    "success"
  );

  $("network-badge").textContent = selectedNetwork.name;
  networkSection.classList.add("hidden");
  connectSection.classList.remove("hidden");
}

// ─── UI State ────────────────────────────────────────────────────────────────

async function showConnected() {
  connectSection.classList.add("hidden");
  walletSection.classList.add("visible");

  const labels: Record<string, string> = {
    cartridge: "Cartridge Wallet",
    privatekey: "Private Key Wallet",
    privy: "Privy Wallet",
    webauthn: "Face ID Wallet",
  };
  $("wallet-type-label").textContent =
    labels[walletType || ""] || "Connected Wallet";

  $btn("btn-test-sign").classList.toggle("hidden", walletType !== "webauthn");

  // Populate transfer token select
  populateTokenSelect();
  addTransferRow();

  // Auto-check deployment and load balances
  await checkDeploymentStatus();
  refreshBalances();
}

function showDisconnected() {
  walletSection.classList.remove("visible");
  connectSection.classList.remove("hidden");
  $("pk-form").classList.add("hidden");
  $("privy-form").classList.add("hidden");
  wallet = null;
  walletType = null;
  balances.clear();
  positions.clear();
  transferRows = [];
  nextTransferId = 0;
  $("balances-list").innerHTML =
    '<div class="empty-state">Loading balances...</div>';
  $("transfer-rows").innerHTML = "";
  $("positions-list").innerHTML =
    '<div class="empty-state">No staking positions. Click + Add Position to start staking.</div>';
}

function setStatus(status: "deployed" | "not-deployed" | "checking") {
  const el = $("wallet-status");
  el.className = `status-badge status-${status === "not-deployed" ? "not-deployed" : status}`;
  el.textContent =
    status === "deployed"
      ? "Deployed"
      : status === "not-deployed"
        ? "Not Deployed"
        : "Checking...";
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".tab-btn")
      .forEach((b) => b.classList.remove("active"));
    document
      .querySelectorAll(".tab-panel")
      .forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    const tab = (btn as HTMLElement).dataset.tab!;
    $(`tab-${tab}`).classList.add("active");
  });
});

// ─── Deployment ──────────────────────────────────────────────────────────────

async function checkDeploymentStatus() {
  if (!wallet) return;
  setStatus("checking");
  try {
    const deployed = await wallet.isDeployed();
    setStatus(deployed ? "deployed" : "not-deployed");
    log(
      `Account is ${deployed ? "deployed" : "not deployed"}`,
      deployed ? "success" : "info"
    );
  } catch (err) {
    log(`Failed to check status: ${err}`, "error");
    setStatus("not-deployed");
  }
}

async function deployAccount() {
  if (!wallet) return;
  const sponsored = isSponsored();
  const btn = $btn("btn-deploy");
  setLoading(btn, true);
  log(`Deploying account${sponsored ? " (sponsored)" : ""}...`, "info");
  try {
    const tx = await wallet.deploy(sponsored ? { feeMode: "sponsored" } : {});
    log(`Deploy tx: ${truncate(tx.hash)}`, "info");
    log("Waiting for confirmation...", "info");
    await tx.wait();
    log("Account deployed!", "success");
    if (tx.explorerUrl) log(`Explorer: ${tx.explorerUrl}`, "info");
    await checkDeploymentStatus();
  } catch (err) {
    log(`Deployment failed: ${err}`, "error");
  } finally {
    setLoading(btn, false, "Deploy Account");
  }
}

// ─── Connection: Cartridge ───────────────────────────────────────────────────

async function connectCartridge() {
  if (!sdk) return;
  setLoading($btn("btn-cartridge"), true);
  log("Connecting to Cartridge Controller...", "info");
  try {
    const STRK =
      "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
    wallet = await sdk.connectCartridge({
      policies: [{ target: STRK, method: "transfer" }],
    });
    walletType = "cartridge";
    $("wallet-address").textContent = truncate(wallet.address);
    $("wallet-address").title = wallet.address;
    log(`Connected: ${truncate(wallet.address)}`, "success");
    await showConnected();
  } catch (err) {
    log(`Cartridge connection failed: ${err}`, "error");
  } finally {
    setLoading($btn("btn-cartridge"), false, "Cartridge");
  }
}

// ─── Connection: Private Key ─────────────────────────────────────────────────

async function connectPrivateKey() {
  if (!sdk) return;
  const privateKey = $input("private-key").value.trim();
  if (!privateKey) {
    log("Please enter a private key", "error");
    return;
  }
  const presetKey = $select("account-preset").value;
  const preset = PRESETS[presetKey];
  setLoading($btn("btn-connect-pk"), true);
  log(`Connecting with ${presetKey} account...`, "info");
  try {
    const signer = new StarkSigner(privateKey);
    wallet = await sdk.connectWallet({
      account: { signer, accountClass: preset },
    });
    walletType = "privatekey";
    $("wallet-address").textContent = truncate(wallet.address);
    $("wallet-address").title = wallet.address;
    log(`Connected: ${truncate(wallet.address)}`, "success");
    log(`Full address: ${wallet.address}`, "info");
    await showConnected();
  } catch (err) {
    log(`Connection failed: ${err}`, "error");
  } finally {
    setLoading($btn("btn-connect-pk"), false, "Connect");
  }
}

// ─── Connection: Privy ───────────────────────────────────────────────────────

async function connectPrivy() {
  if (!sdk) return;
  const email = $input("privy-email").value.trim();
  if (!email || !email.includes("@")) {
    log("Please enter a valid email address", "error");
    return;
  }
  setLoading($btn("btn-connect-privy"), true);
  log(`Connecting with Privy (${email})...`, "info");
  try {
    const healthRes = await fetch(`${PRIVY_SERVER_URL}/api/health`);
    if (!healthRes.ok)
      throw new Error("Privy server not running. Start: npm run dev:server");

    const registerRes = await fetch(`${PRIVY_SERVER_URL}/api/user/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!registerRes.ok) {
      const err = await registerRes.json();
      throw new Error(err.details || err.error || "Failed to register");
    }
    const { isNew, wallet: walletData } = await registerRes.json();
    log(`${isNew ? "Created new" : "Found existing"} Privy wallet`, "info");

    const signer = new PrivySigner({
      walletId: walletData.id,
      publicKey: walletData.publicKey,
      rawSign: async (walletId: string, hash: string) => {
        const res = await fetch(`${PRIVY_SERVER_URL}/api/wallet/sign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletId, hash }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.details || err.error || "Signing failed");
        }
        return (await res.json()).signature;
      },
    });

    const presetKey = $select("privy-account-preset").value;
    wallet = await sdk.connectWallet({
      account: { signer, accountClass: PRESETS[presetKey] },
    });
    walletType = "privy";
    $("wallet-address").textContent = truncate(wallet.address);
    $("wallet-address").title = wallet.address;
    log(`Connected: ${truncate(wallet.address)}`, "success");
    await showConnected();
  } catch (err) {
    log(`Privy connection failed: ${err}`, "error");
  } finally {
    setLoading($btn("btn-connect-privy"), false, "Register / Login");
  }
}

// ─── Connection: WebAuthn ────────────────────────────────────────────────────

async function connectWebAuthn() {
  if (!sdk) return;
  setLoading($btn("btn-webauthn"), true);
  log("WebAuthn/Face ID is not yet available in this build", "error");
  setLoading($btn("btn-webauthn"), false, "Face ID");
}

// ─── Disconnect ──────────────────────────────────────────────────────────────

function disconnect() {
  if (wallet) {
    wallet.disconnect().catch(() => {});
  }
  log("Disconnected", "info");
  showDisconnected();
  $input("private-key").value = "";
}

// ─── Balances ────────────────────────────────────────────────────────────────

async function refreshBalances() {
  if (!wallet) return;
  const btn = $btn("btn-refresh-balances");
  setLoading(btn, true);
  log("Fetching balances...", "info");

  const tokens = getTokens();
  // Show only first 30 tokens to avoid too many RPC calls
  const tokenSlice = tokens.slice(0, 30);
  balances.clear();

  const results = await Promise.allSettled(
    tokenSlice.map(async (token) => {
      const balance = await wallet!.balanceOf(token);
      return { token, balance };
    })
  );

  for (const r of results) {
    if (r.status === "fulfilled") {
      balances.set(r.value.token.address, r.value.balance);
    }
  }

  renderBalances(tokenSlice);
  log(`Loaded ${balances.size} token balances`, "success");
  setLoading(btn, false, "Refresh");
}

function renderBalances(tokens: Token[]) {
  const container = $("balances-list");

  // Sort: non-zero first, then alphabetical
  const sorted = [...tokens].sort((a, b) => {
    const balA = balances.get(a.address);
    const balB = balances.get(b.address);
    const aZero = !balA || balA.isZero();
    const bZero = !balB || balB.isZero();
    if (aZero !== bZero) return aZero ? 1 : -1;
    return a.symbol.localeCompare(b.symbol);
  });

  container.innerHTML = sorted
    .map((token) => {
      const bal = balances.get(token.address);
      const formatted = bal ? bal.toFormatted(true) : "—";
      const isZero = !bal || bal.isZero();
      return `<div class="token-row">
        <span><span class="token-name">${token.symbol}</span><span class="token-symbol">${token.name}</span></span>
        <span class="token-balance ${isZero ? "zero" : ""}">${formatted}</span>
      </div>`;
    })
    .join("");
}

// ─── Transfer ────────────────────────────────────────────────────────────────

function populateTokenSelect() {
  const select = $select("transfer-token");
  const tokens = getTokens();
  select.innerHTML = tokens
    .slice(0, 30)
    .map((t) => `<option value="${t.address}">${t.symbol} — ${t.name}</option>`)
    .join("");
}

function addTransferRow() {
  const id = nextTransferId++;
  transferRows.push({ id });
  const container = $("transfer-rows");
  const div = document.createElement("div");
  div.className = "transfer-row";
  div.id = `transfer-row-${id}`;
  div.innerHTML = `
    <div class="form-group" style="flex: 2;">
      <label>Recipient</label>
      <input type="text" id="transfer-to-${id}" placeholder="0x..." />
    </div>
    <div class="form-group" style="flex: 1;">
      <label>Amount</label>
      <input type="text" id="transfer-amount-${id}" placeholder="0.0" />
    </div>
    ${transferRows.length > 1 ? `<button class="btn-remove-transfer" data-id="${id}">&times;</button>` : ""}
  `;
  container.appendChild(div);

  div.querySelector(".btn-remove-transfer")?.addEventListener("click", () => {
    transferRows = transferRows.filter((r) => r.id !== id);
    div.remove();
  });
}

async function sendTransfer() {
  if (!wallet) return;

  const tokenAddress = $select("transfer-token").value;
  const tokens = getTokens();
  const token = tokens.find((t) => t.address === tokenAddress);
  if (!token) {
    log("Select a token", "error");
    return;
  }

  const transfers: { to: ReturnType<typeof fromAddress>; amount: Amount }[] =
    [];
  for (const row of transferRows) {
    const to = $input(`transfer-to-${row.id}`).value.trim();
    const amountStr = $input(`transfer-amount-${row.id}`).value.trim();
    if (!to || !amountStr) continue;
    try {
      transfers.push({
        to: fromAddress(to),
        amount: Amount.parse(amountStr, token),
      });
    } catch (err) {
      log(`Invalid transfer data: ${err}`, "error");
      return;
    }
  }

  if (transfers.length === 0) {
    log("Add at least one recipient", "error");
    return;
  }

  const sponsored = isSponsored();
  const btn = $btn("btn-send-transfer");
  setLoading(btn, true);
  log(
    `Sending ${transfers.length} transfer(s) of ${token.symbol}${sponsored ? " (sponsored)" : ""}...`,
    "info"
  );

  try {
    const tx = await wallet.transfer(
      token,
      transfers,
      sponsored ? { feeMode: "sponsored" } : undefined
    );
    log(`Tx submitted: ${truncate(tx.hash)}`, "success");
    if (tx.explorerUrl) log(`Explorer: ${tx.explorerUrl}`, "info");
    log("Waiting for confirmation...", "info");
    await tx.wait();
    log("Transfer confirmed!", "success");
  } catch (err) {
    log(`Transfer failed: ${err}`, "error");
  } finally {
    setLoading(btn, false, "Send Transfer");
  }
}

// ─── Staking ─────────────────────────────────────────────────────────────────

function openValidatorPicker() {
  const validators = getValidators();
  const container = $("validator-list");
  container.innerHTML = Object.entries(validators)
    .map(
      ([key, v]) => `
    <div class="validator-row" data-key="${key}">
      <div>
        <div class="validator-name">${v.name}</div>
        <div class="validator-address">${truncate(v.stakerAddress, 8)}</div>
      </div>
    </div>`
    )
    .join("");

  container.querySelectorAll(".validator-row").forEach((row) => {
    row.addEventListener("click", () => {
      selectedValidatorKey = (row as HTMLElement).dataset.key!;
      $("modal-validator").classList.remove("visible");
      pickPoolsForValidator();
    });
  });

  $("modal-validator").classList.add("visible");
}

async function pickPoolsForValidator() {
  if (!sdk || !selectedValidatorKey) return;
  const validators = getValidators();
  const validator = validators[selectedValidatorKey];
  if (!validator) return;

  log(`Loading pools for ${validator.name}...`, "info");
  const poolList = $("pool-list");
  poolList.innerHTML = '<div class="empty-state">Loading pools...</div>';
  $("modal-pool").classList.add("visible");

  try {
    const pools = await sdk.getStakerPools(validator.stakerAddress);
    if (pools.length === 0) {
      poolList.innerHTML =
        '<div class="empty-state">No pools available for this validator</div>';
      return;
    }
    poolList.innerHTML = pools
      .map(
        (p, i) => `
      <div class="pool-row" style="cursor: pointer;" data-index="${i}">
        <span style="font-weight: 500;">${p.token.symbol}</span>
        <span style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-secondary);">
          ${p.amount.toFormatted(true)} delegated
        </span>
      </div>`
      )
      .join("");

    poolList.querySelectorAll(".pool-row").forEach((row) => {
      row.addEventListener("click", async () => {
        const idx = parseInt((row as HTMLElement).dataset.index!);
        const pool = pools[idx];
        $("modal-pool").classList.remove("visible");
        await addPosition(selectedValidatorKey!, validator, pool);
      });
    });
  } catch (err) {
    log(`Failed to load pools: ${err}`, "error");
    poolList.innerHTML = '<div class="empty-state">Failed to load pools</div>';
  }
}

async function addPosition(
  validatorKey: string,
  validator: Validator,
  pool: Pool
) {
  if (!wallet) return;
  const key = `${validatorKey}:${pool.token.address}`;
  if (positions.has(key)) {
    log(
      `Position for ${pool.token.symbol} with ${validator.name} already added`,
      "info"
    );
    return;
  }

  positions.set(key, {
    key,
    validatorKey,
    validator,
    token: pool.token,
    pool,
    position: null,
    isMember: false,
  });

  log(`Added position: ${validator.name} (${pool.token.symbol})`, "success");
  await loadPosition(key);
  renderPositions();
}

async function loadPosition(key: string) {
  if (!wallet) return;
  const pos = positions.get(key);
  if (!pos) return;

  try {
    const [position, isMember] = await Promise.all([
      wallet.getPoolPosition(pos.pool.poolContract),
      wallet.isPoolMember(pos.pool.poolContract),
    ]);
    pos.position = position;
    pos.isMember = isMember;
  } catch (err) {
    log(`Failed to load position ${key}: ${err}`, "error");
  }
}

function renderPositions() {
  const container = $("positions-list");
  if (positions.size === 0) {
    container.innerHTML =
      '<div class="empty-state">No staking positions. Click + Add Position to start staking.</div>';
    return;
  }

  container.innerHTML = Array.from(positions.values())
    .map((pos) => {
      const p = pos.position;
      const memberBadge = pos.isMember
        ? '<span style="color: var(--success); font-size: 0.7rem;">MEMBER</span>'
        : '<span style="color: var(--text-muted); font-size: 0.7rem;">NOT MEMBER</span>';

      const stats = p
        ? `
        <div class="position-stat"><span class="label">Staked</span><span class="value">${p.staked.toFormatted(true)}</span></div>
        <div class="position-stat"><span class="label">Rewards</span><span class="value">${p.rewards.toFormatted(true)}</span></div>
        <div class="position-stat"><span class="label">Total</span><span class="value">${p.total.toFormatted(true)}</span></div>
        <div class="position-stat"><span class="label">Commission</span><span class="value">${p.commissionPercent}%</span></div>
        ${!p.unpooling.isZero() ? `<div class="position-stat"><span class="label">Unpooling</span><span class="value">${p.unpooling.toFormatted(true)}</span></div>` : ""}
        ${p.unpoolTime ? `<div class="position-stat"><span class="label">Unpool at</span><span class="value">${p.unpoolTime.toLocaleString()}</span></div>` : ""}
      `
        : '<div style="color: var(--text-muted); font-size: 0.85rem;">No active position</div>';

      // Determine available actions
      const canStake = !pos.isMember;
      const canAddStake = pos.isMember;
      const canClaim = p && !p.rewards.isZero();
      const canExitIntent = p && p.staked.isPositive() && p.unpooling.isZero();
      const canExit = p && p.unpoolTime && new Date() >= p.unpoolTime;

      return `<div class="position-card">
        <div class="header">
          <strong>${pos.validator.name} — ${pos.token.symbol}</strong>
          ${memberBadge}
        </div>
        ${stats}
        <div class="staking-actions">
          ${canStake ? `<button class="btn btn-primary btn-sm" data-action="stake" data-key="${pos.key}">Stake</button>` : ""}
          ${canAddStake ? `<button class="btn btn-primary btn-sm" data-action="addStake" data-key="${pos.key}">Add Stake</button>` : ""}
          ${canClaim ? `<button class="btn btn-green btn-sm" data-action="claimRewards" data-key="${pos.key}">Claim Rewards</button>` : ""}
          ${canExitIntent ? `<button class="btn btn-secondary btn-sm" data-action="exitIntent" data-key="${pos.key}">Exit Intent</button>` : ""}
          ${canExit ? `<button class="btn btn-secondary btn-sm" data-action="exit" data-key="${pos.key}">Complete Exit</button>` : ""}
          <button class="btn btn-secondary btn-sm" data-action="refresh" data-key="${pos.key}">Refresh</button>
          <button class="btn btn-disconnect btn-sm" data-action="remove" data-key="${pos.key}">Remove</button>
        </div>
      </div>`;
    })
    .join("");

  // Bind action buttons
  container.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = (btn as HTMLElement).dataset.action!;
      const key = (btn as HTMLElement).dataset.key!;
      handleStakingAction(action, key);
    });
  });
}

function handleStakingAction(action: string, key: string) {
  if (action === "remove") {
    positions.delete(key);
    renderPositions();
    return;
  }
  if (action === "refresh") {
    loadPosition(key).then(() => renderPositions());
    return;
  }
  if (action === "claimRewards") {
    claimRewards(key);
    return;
  }
  if (action === "exit") {
    completeExit(key);
    return;
  }
  // stake, addStake, exitIntent need amount input
  stakingActionType = action as "stake" | "addStake" | "exitIntent";
  stakingActionKey = key;
  const titles: Record<string, string> = {
    stake: "Stake Tokens",
    addStake: "Add to Stake",
    exitIntent: "Exit Intent (amount to unstake)",
  };
  $("staking-action-title").textContent = titles[action] || "Stake";
  $input("staking-action-amount").value = "";
  $("modal-staking-action").classList.add("visible");
}

async function confirmStakingAction() {
  if (!wallet || !stakingActionKey || !stakingActionType) return;
  const amountStr = $input("staking-action-amount").value.trim();
  if (!amountStr) {
    log("Enter an amount", "error");
    return;
  }

  const pos = positions.get(stakingActionKey);
  if (!pos) return;

  $("modal-staking-action").classList.remove("visible");

  const poolAddress = pos.pool.poolContract;
  let amount: Amount;
  try {
    amount = Amount.parse(amountStr, pos.token);
  } catch (err) {
    log(`Invalid amount: ${err}`, "error");
    return;
  }

  log(
    `${stakingActionType}: ${amountStr} ${pos.token.symbol} to ${pos.validator.name}...`,
    "info"
  );

  const opts = isSponsored() ? { feeMode: "sponsored" as const } : undefined;

  try {
    let tx;
    if (stakingActionType === "stake") {
      tx = await wallet.enterPool(poolAddress, amount, opts);
    } else if (stakingActionType === "addStake") {
      tx = await wallet.addToPool(poolAddress, amount, opts);
    } else {
      tx = await wallet.exitPoolIntent(poolAddress, amount, opts);
    }
    log(`Tx submitted: ${truncate(tx.hash)}`, "success");
    if (tx.explorerUrl) log(`Explorer: ${tx.explorerUrl}`, "info");
    log("Waiting for confirmation...", "info");
    await tx.wait();
    log(`${stakingActionType} confirmed!`, "success");
    await loadPosition(stakingActionKey);
    renderPositions();
  } catch (err) {
    log(`${stakingActionType} failed: ${err}`, "error");
  }
}

async function claimRewards(key: string) {
  if (!wallet) return;
  const pos = positions.get(key);
  if (!pos) return;

  const sponsored = isSponsored();
  log(
    `Claiming rewards from ${pos.validator.name}${sponsored ? " (sponsored)" : ""}...`,
    "info"
  );
  try {
    const tx = await wallet.claimPoolRewards(
      pos.pool.poolContract,
      sponsored ? { feeMode: "sponsored" } : undefined
    );
    log(`Tx submitted: ${truncate(tx.hash)}`, "success");
    if (tx.explorerUrl) log(`Explorer: ${tx.explorerUrl}`, "info");
    await tx.wait();
    log("Rewards claimed!", "success");
    await loadPosition(key);
    renderPositions();
  } catch (err) {
    log(`Claim failed: ${err}`, "error");
  }
}

async function completeExit(key: string) {
  if (!wallet) return;
  const pos = positions.get(key);
  if (!pos) return;

  const sponsored = isSponsored();
  log(
    `Completing exit from ${pos.validator.name}${sponsored ? " (sponsored)" : ""}...`,
    "info"
  );
  try {
    const tx = await wallet.exitPool(
      pos.pool.poolContract,
      sponsored ? { feeMode: "sponsored" } : undefined
    );
    log(`Tx submitted: ${truncate(tx.hash)}`, "success");
    if (tx.explorerUrl) log(`Explorer: ${tx.explorerUrl}`, "info");
    await tx.wait();
    log("Exit complete! Tokens returned to wallet.", "success");
    await loadPosition(key);
    renderPositions();
  } catch (err) {
    log(`Exit failed: ${err}`, "error");
  }
}

// ─── Event Listeners ─────────────────────────────────────────────────────────

// Network
$btn("btn-net-sepolia").addEventListener("click", () => selectNetworkPreset(0));
$btn("btn-net-mainnet").addEventListener("click", () => selectNetworkPreset(1));
$btn("btn-custom-toggle").addEventListener("click", () => {
  isCustomNetwork = !isCustomNetwork;
  $("custom-network-form").classList.toggle("hidden", !isCustomNetwork);
  if (isCustomNetwork) {
    $btn("btn-net-sepolia").style.borderColor = "var(--border-color)";
    $btn("btn-net-sepolia").style.color = "var(--text-primary)";
    $btn("btn-net-mainnet").style.borderColor = "var(--border-color)";
    $btn("btn-net-mainnet").style.color = "var(--text-primary)";
  } else {
    selectNetworkPreset(0);
  }
});
$btn("btn-confirm-network").addEventListener("click", confirmNetwork);
$btn("btn-change-network").addEventListener("click", () => {
  showDisconnected();
  connectSection.classList.add("hidden");
  networkSection.classList.remove("hidden");
});

// Connection
$btn("btn-cartridge").addEventListener("click", connectCartridge);
$btn("btn-webauthn").addEventListener("click", connectWebAuthn);
$btn("btn-toggle-pk").addEventListener("click", () => {
  $("pk-form").classList.toggle("hidden");
  $("privy-form").classList.add("hidden");
});
$btn("btn-privy").addEventListener("click", () => {
  $("privy-form").classList.toggle("hidden");
  $("pk-form").classList.add("hidden");
});
$btn("btn-connect-pk").addEventListener("click", connectPrivateKey);
$btn("btn-connect-privy").addEventListener("click", connectPrivy);
$input("private-key").addEventListener("keypress", (e) => {
  if (e.key === "Enter") connectPrivateKey();
});
$btn("btn-generate-key").addEventListener("click", () => {
  const randomBytes = ec.starkCurve.utils.randomPrivateKey();
  const pk =
    "0x" +
    Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  $input("private-key").value = pk;
  $input("private-key").type = "text";
  log("Generated random private key", "success");
});

// Wallet actions
$btn("btn-check-deployed").addEventListener("click", async () => {
  setLoading($btn("btn-check-deployed"), true);
  await checkDeploymentStatus();
  setLoading($btn("btn-check-deployed"), false, "Check Status");
});
$btn("btn-deploy").addEventListener("click", deployAccount);
$btn("btn-disconnect").addEventListener("click", disconnect);
$btn("btn-copy-address").addEventListener("click", async () => {
  if (!wallet) return;
  try {
    await navigator.clipboard.writeText(wallet.address);
    $btn("btn-copy-address").textContent = "✓";
    log(`Copied: ${wallet.address}`, "success");
    setTimeout(() => ($btn("btn-copy-address").textContent = "📋"), 2000);
  } catch {
    log(`Address: ${wallet.address}`, "info");
  }
});

// Balances
$btn("btn-refresh-balances").addEventListener("click", refreshBalances);

// Transfer
$btn("btn-add-transfer").addEventListener("click", addTransferRow);
$btn("btn-send-transfer").addEventListener("click", sendTransfer);

// Staking
$btn("btn-add-position").addEventListener("click", openValidatorPicker);
$btn("btn-close-validator").addEventListener("click", () =>
  $("modal-validator").classList.remove("visible")
);
$btn("btn-close-pool").addEventListener("click", () =>
  $("modal-pool").classList.remove("visible")
);
$btn("btn-staking-action-confirm").addEventListener(
  "click",
  confirmStakingAction
);
$btn("btn-staking-action-cancel").addEventListener("click", () =>
  $("modal-staking-action").classList.remove("visible")
);

// Init
selectNetworkPreset(0);
log("Select a network to get started", "info");
