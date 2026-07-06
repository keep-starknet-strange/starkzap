import { writable } from "svelte/store";
import type { Eip1193Provider, SolanaProvider } from "starkzap";
import {
  BridgeController,
  initializeAppKit,
  type BridgeState,
  type BridgeDirection,
  type BridgeChainFilter,
} from "../../../bridge";
import type { StoredBridgeTx } from "../../../bridge/tx-storage";
import { sdk, walletState } from "~/lib/stores/wallet";
import { CHAIN_ID, REOWN_PROJECT_ID } from "~/lib/stores/config";
import { log } from "~/lib/stores/logger";

export const enabled = !!REOWN_PROJECT_ID;
// Not `state` — that name collides with Svelte 5's `$state` rune.
export const bridgeState = writable<BridgeState | null>(null);
export const history = writable<StoredBridgeTx[]>([]);

let controller: BridgeController | null = null;
let appKit: ReturnType<typeof initializeAppKit> | null = null;
let ethProvider: Eip1193Provider | null = null;
let solSigner: SolanaProvider | null = null;

// Push the controller's internal state into the reactive stores.
function render() {
  if (!controller) return;
  bridgeState.set({ ...controller.getState() });
  history.set([...controller.getTxHistory()]);
}

// The controller's LogFn allows a "default" level; map it to "info".
const bridgeLog = (
  msg: string,
  type?: "default" | "error" | "info" | "success"
) => log(msg, type === "default" || type === undefined ? "info" : type);

async function syncEthWallet() {
  if (!controller || !appKit) return;
  const address = appKit.getAddress("eip155");
  const chainId = appKit.getChainId();
  if (appKit.getIsConnectedState() && address && chainId && ethProvider) {
    await controller.connectEthereumWallet(
      ethProvider,
      address,
      String(chainId)
    );
  } else if (!appKit.getIsConnectedState() || !ethProvider) {
    controller.disconnectEthWallet();
  }
}

async function syncSolWallet() {
  if (!controller || !appKit) return;
  const address = appKit.getAddress("solana");
  const chainId = appKit.getChainId();
  if (appKit.getIsConnectedState() && address && chainId && solSigner) {
    await controller.connectSolanaWallet(solSigner, address, String(chainId));
  } else if (!appKit.getIsConnectedState() || !solSigner) {
    controller.disconnectSolWallet();
  }
}

function syncWallets() {
  void syncEthWallet();
  void syncSolWallet();
}

// Lazily create the controller + AppKit once (on first bridge mount).
export function ensureBridge(): void {
  if (controller || !enabled) return;
  controller = new BridgeController(sdk, CHAIN_ID, bridgeLog, render);
  appKit = initializeAppKit(REOWN_PROJECT_ID!);
  appKit.subscribeProviders((providers) => {
    ethProvider = providers["eip155"] as Eip1193Provider | null;
    solSigner = providers["solana"] as SolanaProvider | null;
    syncWallets();
  });
  appKit.subscribeAccount(syncWallets);
  appKit.subscribeNetwork(syncWallets);
  // Feed the current (and future) Starknet wallet into the controller.
  walletState.subscribe((s) => controller?.setStarknetWallet(s.wallet));
}

export function openAppKit(): void {
  appKit?.open();
}

// Thin pass-throughs to the controller (each triggers render()).
export const setDirection = (d: BridgeDirection) => controller?.setDirection(d);
export const setRoute = (f: BridgeChainFilter, d: BridgeDirection) =>
  controller?.setRoute(f, d);
export const selectToken = (id: string | null) => controller?.selectToken(id);
export const setFastTransfer = (v: boolean) => controller?.setFastTransfer(v);
export const setAutoWithdraw = (v: boolean) => controller?.setAutoWithdraw(v);
export const refresh = () => controller?.refresh();
export const fetchFeeEstimate = () => controller?.fetchFeeEstimate();
export const deposit = (amount: string) => controller?.deposit(amount);
export const initiateWithdraw = (amount: string) =>
  controller?.initiateWithdraw(amount);
export const checkTxStatus = (id: string) => controller?.checkTxStatus(id);
export const completeBridgeTx = (id: string) =>
  controller?.completeBridgeTx(id);
export const removeTxRecord = (id: string) => controller?.removeTxRecord(id);
export const clearCompletedTxRecords = () =>
  controller?.clearCompletedTxRecords();
