import {
  StarkSDK,
  StarkSigner,
  OnboardStrategy,
  ChainId,
  OpenZeppelinPreset,
  ArgentPreset,
  ArgentXV050Preset,
  BraavosPreset,
  DevnetPreset,
  type WalletInterface,
  type AccountClassConfig,
} from "x";
import { ec } from "starknet";

// Configuration
const RPC_URL = "https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_9";
const PRIVY_SERVER_URL = "http://localhost:3001";
const DUMMY_POLICY = {
  target: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d", // STRK
  method: "transfer",
};

// SDK instance
const sdk = new StarkSDK({
  rpcUrl: RPC_URL,
  chainId: ChainId.SEPOLIA,
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

// Preset mapping
const presets: Record<string, AccountClassConfig> = {
  openzeppelin: OpenZeppelinPreset,
  argent: ArgentPreset,
  argentx050: ArgentXV050Preset,
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
    const onboard = await sdk.onboard({
      strategy: OnboardStrategy.Cartridge,
      deploy: "never",
      cartridge: { policies: [DUMMY_POLICY] },
    });
    wallet = onboard.wallet;
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
    const onboard = await sdk.onboard({
      strategy: OnboardStrategy.Signer,
      deploy: "never",
      account: { signer },
      accountPreset: preset,
    });
    wallet = onboard.wallet;
    walletType = "privatekey";

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

    // Store wallet ID for debugging
    privyWalletId = walletData.id;

    // Use selected account preset from Privy dropdown
    const presetKey = privyAccountPresetSelect.value;
    const preset = presets[presetKey];
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

// Initial log
log(`SDK initialized with RPC: ${RPC_URL}`, "info");
