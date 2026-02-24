/**
 * StarkZap SDK integration for Floppy Bird (nebez/floppybird fork).
 * Controller button & leaderboard UI styled after FOS: https://github.com/0xsisyfos/fos
 *
 * Uses only: StarkZap (via ./starknet), DOM APIs, and game assets (jQuery, buzz, main.js).
 */
import { networks } from "starkzap";
import * as starknet from "./starknet";

const btnConnect = document.getElementById("starknet-connect") as HTMLButtonElement;
const btnLeaderboard = document.getElementById("starknet-leaderboard") as HTMLButtonElement;
const btnDisconnect = document.getElementById("starknet-disconnect") as HTMLButtonElement;
const controllerOverlay = document.getElementById("controller-overlay")!;
const leaderboardOverlay = document.getElementById("leaderboard-overlay")!;
const controllerPopupClose = document.getElementById("controller-popup-close")!;
const leaderboardPopupClose = document.getElementById("leaderboard-popup-close")!;
const controllerStatusLine = document.getElementById("controller-status-line")!;
const controllerUsernameLine = document.getElementById("controller-username-line") as HTMLParagraphElement;
const controllerAddressLine = document.getElementById("controller-address-line")!;
const controllerAddressShort = document.getElementById("controller-address-short")!;
const controllerAddressCopy = document.getElementById("controller-address-copy") as HTMLButtonElement;
const controllerAddressVoyager = document.getElementById("controller-address-voyager") as HTMLAnchorElement;
const leaderboardList = document.getElementById("leaderboard-list")!;

const EXPLORER_BASE_URL = networks.sepolia.explorerUrl ?? "https://sepolia.voyager.online";

function truncate(a: string, len = 5): string {
  if (a.length <= len * 2) return a;
  return a.slice(0, len) + "..." + a.slice(-len);
}

function formatAddress(address: string): string {
  if (!address || address.length <= 10) return address;
  return truncate(address, 5);
}

async function updateControllerButton(): Promise<void> {
  if (starknet.isConnected()) {
    const username = await starknet.getUsername();
    btnConnect.textContent = username || "Connected";
  } else {
    btnConnect.textContent = "Connect Controller";
  }
}

async function refreshLeaderboard(): Promise<void> {
  const high = await starknet.getHighScore();
  if (starknet.isConnected() && high > 0) {
    // Could show on controller popup or leave for leaderboard modal only
  }
}

function showConnected(): void {
  updateControllerButton();
  refreshLeaderboard();
}

function showDisconnected(): void {
  btnConnect.textContent = "Connect Controller";
  controllerOverlay.classList.remove("show");
}

function openControllerPopup(): void {
  const w = starknet.getWallet();
  if (w) {
    controllerStatusLine.textContent = "Status: Connected";
    controllerUsernameLine.style.display = "block";
    starknet.getUsername().then((u) => {
      controllerUsernameLine.textContent = u ? `Username: ${u}` : "";
      if (!u) controllerUsernameLine.style.display = "none";
    });
    const addr = starknet.getAddress();
    if (addr) {
      controllerAddressShort.textContent = formatAddress(addr);
      controllerAddressLine.style.display = "flex";
      controllerAddressLine.dataset.address = addr;
      controllerAddressVoyager.href = `${EXPLORER_BASE_URL}/contract/${addr}`;
    } else {
      controllerAddressLine.style.display = "none";
    }
  } else {
    controllerStatusLine.textContent = "Status: Disconnected";
    controllerUsernameLine.style.display = "none";
    controllerAddressLine.style.display = "none";
  }
  controllerOverlay.classList.add("show");
}

function closeControllerPopup(): void {
  controllerOverlay.classList.remove("show");
}

function openLeaderboardPopup(): void {
  leaderboardList.innerHTML = "<span class=\"muted\">Loading…</span>";
  leaderboardOverlay.classList.add("show");
  starknet.getLeaderboard().then((entries) => {
    const sorted = [...entries].sort((a, b) => b.score - a.score).slice(0, 10);
    if (sorted.length === 0) {
      leaderboardList.innerHTML = "<span class=\"muted\">No entries yet</span>";
      return;
    }
    leaderboardList.innerHTML = sorted
      .map(
        (e, i) =>
          `<div class="leaderboard-entry"><span class="rank">${i + 1}</span><span class="addr">${formatAddress(e.address)}</span><span class="score">${e.score}</span></div>`
      )
      .join("");
  }).catch(() => {
    leaderboardList.innerHTML = "<span class=\"muted\">Failed to load</span>";
  });
}

function closeLeaderboardPopup(): void {
  leaderboardOverlay.classList.remove("show");
}

// Floppy Bird hooks (patched main.js calls these)
window.__starknetCanStart = () => starknet.isConnected();
window.__starknetOnStart = () => {
  starknet.startNewGame().catch(() => {});
};
window.__starknetOnScore = () => {
  starknet.incrementScore();
};
window.__starknetOnGameOver = () => {
  starknet.endGame();
  refreshLeaderboard();
};

async function onControllerClick(): Promise<void> {
  if (starknet.isConnected()) {
    openControllerPopup();
    return;
  }
  btnConnect.disabled = true;
  btnConnect.textContent = "…";
  try {
    starknet.initSdk();
    await starknet.connectCartridge();
    showConnected();
  } catch (e) {
    console.error(e);
    btnConnect.textContent = "Connect Controller";
  } finally {
    btnConnect.disabled = false;
    if (!starknet.isConnected()) btnConnect.textContent = "Connect Controller";
  }
}

function onDisconnect(): void {
  starknet.disconnect();
  showDisconnected();
}

btnConnect.addEventListener("click", (e) => {
  e.stopPropagation();
  onControllerClick();
});

btnLeaderboard.addEventListener("click", (e) => {
  e.stopPropagation();
  openLeaderboardPopup();
});

btnDisconnect.addEventListener("click", (e) => {
  e.stopPropagation();
  onDisconnect();
});

controllerAddressCopy.addEventListener("click", (e) => {
  e.stopPropagation();
  const full = controllerAddressLine.dataset.address;
  if (full) {
    navigator.clipboard.writeText(full).then(
      () => { controllerAddressCopy.textContent = "Copied!"; setTimeout(() => { controllerAddressCopy.textContent = "Copy"; }, 1500); },
      () => { controllerAddressCopy.textContent = "Copy"; }
    );
  }
});

controllerPopupClose.addEventListener("click", (e) => {
  e.stopPropagation();
  closeControllerPopup();
});

leaderboardPopupClose.addEventListener("click", (e) => {
  e.stopPropagation();
  closeLeaderboardPopup();
});

controllerOverlay.addEventListener("click", (e) => {
  if (e.target === controllerOverlay) closeControllerPopup();
});

leaderboardOverlay.addEventListener("click", (e) => {
  if (e.target === leaderboardOverlay) closeLeaderboardPopup();
});

declare global {
  interface Window {
    __starknetCanStart?: () => boolean;
    __starknetOnStart?: () => void;
    __starknetOnScore?: () => void;
    __starknetOnGameOver?: () => void;
  }
}
