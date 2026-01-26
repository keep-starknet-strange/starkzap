import {
  StarkSDK,
  StarkSigner,
  PrivySigner,
  OpenZeppelinPreset,
  ArgentPreset,
  ArgentXV050Preset,
  BraavosPreset,
  DevnetPreset,
  type WalletInterface,
  type AccountClassConfig,
} from "x";

// Configuration
const RPC_URL = "https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_9";
const PRIVY_SERVER_URL = "http://localhost:3001";
const DUMMY_POLICY = {
  target: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
  method: "transfer",
};

// SDK instance
const sdk = new StarkSDK({
  rpcUrl: RPC_URL,
  chainId: "SN_SEPOLIA",
});

// Current wallet
let wallet: WalletInterface | null = null;
let walletType: "cartridge" | "privatekey" | "privy" | null = null;

// Privy wallet info (stored for signing)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let privyWalletId: string | null = null;

// DOM Elements
const _connectSection = document.getElementById("connect-section")!;
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

const privateKeyInput = document.getElementById(
  "private-key"
) as HTMLInputElement;
const privyEmailInput = document.getElementById(
  "privy-email"
) as HTMLInputElement;
const accountPresetSelect = document.getElementById(
  "account-preset"
) as HTMLSelectElement;
const privyForm = document.getElementById("privy-form")!;
const walletAddressEl = document.getElementById("wallet-address")!;
const walletStatusEl = document.getElementById("wallet-status")!;
const walletTypeLabelEl = document.getElementById("wallet-type-label")!;

// Preset mapping
const presets: Record<string, AccountClassConfig> = {
  openzeppelin: OpenZeppelinPreset,
  argent: ArgentPreset,
  braavos: BraavosPreset,
  devnet: DevnetPreset,
};

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
}

function showDisconnected() {
  walletSection.classList.remove("visible");
  pkForm.classList.add("hidden");
  privyForm.classList.add("hidden");
  wallet = null;
  walletType = null;
  privyWalletId = null;
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
    wallet = await sdk.connectCartridge({
      policies: [DUMMY_POLICY],
    });
    walletType = "cartridge";

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

  setButtonLoading(btnConnectPk, true);
  log(`Connecting with ${presetKey} account...`, "info");

  try {
    const signer = new StarkSigner(privateKey);
    wallet = await sdk.connectWallet({
      account: {
        signer,
        accountClass: preset,
      },
    });
    walletType = "privatekey";

    walletAddressEl.textContent = truncateAddress(wallet.address);
    walletAddressEl.title = wallet.address;

    log(`Connected: ${truncateAddress(wallet.address)}`, "success");
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
    const registerRes = await fetch(`${PRIVY_SERVER_URL}/api/user/register`, {
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

    // Store wallet ID for signing
    privyWalletId = walletData.id;

    // Create signer with rawSign callback
    const signer = new PrivySigner({
      walletId: walletData.id,
      publicKey: walletData.publicKey,
      rawSign: async (walletId: string, hash: string) => {
        const signRes = await fetch(`${PRIVY_SERVER_URL}/api/wallet/sign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletId, hash }),
        });

        if (!signRes.ok) {
          const err = await signRes.json();
          throw new Error(err.details || err.error || "Signing failed");
        }

        const { signature } = await signRes.json();
        return signature;
      },
    });

    // Connect wallet with ArgentX v0.5.0 preset (used by Privy)
    wallet = await sdk.connectWallet({
      account: {
        signer,
        accountClass: ArgentXV050Preset,
      },
    });
    walletType = "privy";

    // Compare addresses
    log(`SDK computed address: ${wallet.address}`, "info");
    if (walletData.address.toLowerCase() !== wallet.address.toLowerCase()) {
      log(
        `WARNING: Address mismatch! Privy and SDK computed different addresses.`,
        "error"
      );
      log(
        `This means the account class or constructor format doesn't match Privy's.`,
        "error"
      );
    }

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

btnDisconnect.addEventListener("click", disconnect);

// Allow Enter key to submit private key form
privateKeyInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    connectPrivateKey();
  }
});

// Initial log
log(`SDK initialized with RPC: ${RPC_URL}`, "info");
