import { writable } from "svelte/store";
import type PrivyClient from "@privy-io/js-sdk-core";
import { PRIVY_APP_ID, PRIVY_CLIENT_ID, PRIVY_SERVER_URL } from "./config";

// In-browser Privy login via the framework-agnostic vanilla SDK. The browser
// authenticates with Privy (email OTP) to obtain an access token; the example
// server verifies that token and manages the Starknet wallet.

export const privyEnabled = !!(PRIVY_APP_ID && PRIVY_CLIENT_ID);
export const serverUrl = PRIVY_SERVER_URL;
// null = unknown/not-yet-checked; true/false = last health-check result.
export const serverHealthy = writable<boolean | null>(null);
export const ready = writable(false); // client initialized (session restored)
export const loggedIn = writable(false);
export const codeSent = writable(false);
export const busy = writable(false);
export const error = writable<string | null>(null);

let client: PrivyClient | null = null;

// Create + initialize the client once. Lazy import so the SDK isn't loaded
// (or required) unless Privy is actually used.
async function ensureClient(): Promise<PrivyClient> {
  if (client) return client;
  if (!privyEnabled) {
    throw new Error("Set VITE_PRIVY_APP_ID and VITE_PRIVY_CLIENT_ID.");
  }
  const { default: Privy, LocalStorage } =
    await import("@privy-io/js-sdk-core");
  client = new Privy({
    appId: PRIVY_APP_ID!,
    clientId: PRIVY_CLIENT_ID!,
    storage: new LocalStorage(),
  });
  await client.initialize();
  mountEmbeddedWallet(client);
  const { user } = await client.user.get();
  loggedIn.set(!!user);
  ready.set(true);
  return client;
}

/**
 * Mount the embedded-wallet iframe and relay messages to and from it.
 *
 * The user's signing key lives inside a Privy-hosted iframe, never in page
 * scope, and that key is what authorizes wallet-API requests. React's SDK mounts
 * the iframe for you and the Expo SDK signs natively; the vanilla browser SDK
 * does neither, so without this any attempt to use the user's key throws
 * "Embedded wallet proxy not initialized".
 *
 * Bidirectional by necessity: `setMessagePoster` gives the SDK a way to post
 * into the iframe, and the listener feeds replies back through `onMessage`. The
 * `event.source` check matters — without it any frame on the page could inject
 * responses the SDK would treat as coming from Privy.
 */
function mountEmbeddedWallet(privy: PrivyClient): void {
  const iframe = document.createElement("iframe");
  iframe.src = privy.embeddedWallet.getURL();
  iframe.style.display = "none";
  document.body.appendChild(iframe);

  // Privy's docs pass `iframe.contentWindow` straight in, but this SDK version's
  // `EmbeddedWalletMessagePoster` also requires `reload`, and its `transfer`
  // parameter is one Transferable where `Window.postMessage` takes an array.
  privy.setMessagePoster({
    postMessage: (message, targetOrigin, transfer) =>
      iframe.contentWindow?.postMessage(
        message,
        targetOrigin,
        transfer ? [transfer] : undefined
      ),
    reload: () => {
      iframe.src = privy.embeddedWallet.getURL();
    },
  });

  window.addEventListener("message", (event) => {
    if (event.source !== iframe.contentWindow) return;
    const data =
      typeof event.data === "string" ? JSON.parse(event.data) : event.data;
    privy.embeddedWallet.onMessage(data);
  });
}

// Ping the example server's Privy health endpoint (200 only when the server has
// Privy enabled; 404 → serverHealthy=false, which is the right signal here).
export async function checkServerHealth(): Promise<void> {
  try {
    const res = await fetch(`${PRIVY_SERVER_URL}/api/health/privy`);
    serverHealthy.set(res.ok);
  } catch {
    serverHealthy.set(false);
  }
}

export async function init(): Promise<void> {
  if (!privyEnabled) return;
  try {
    await ensureClient();
  } catch (err) {
    error.set(String(err));
  }
}

export async function sendCode(email: string): Promise<void> {
  busy.set(true);
  error.set(null);
  try {
    const c = await ensureClient();
    await c.auth.email.sendCode(email);
    codeSent.set(true);
  } catch (err) {
    error.set(String(err));
  } finally {
    busy.set(false);
  }
}

export async function loginWithCode(email: string, otp: string): Promise<void> {
  busy.set(true);
  error.set(null);
  try {
    const c = await ensureClient();
    await c.auth.email.loginWithCode(email, otp);
    loggedIn.set(true);
    codeSent.set(false);
  } catch (err) {
    error.set(String(err));
  } finally {
    busy.set(false);
  }
}

// Current Privy access token (auto-refreshed by the SDK). Null if not logged in.
export async function getAccessToken(): Promise<string | null> {
  const c = await ensureClient();
  return c.getAccessToken();
}

/** The wallet-API request an authorization signature covers. */
export interface AuthorizationSignatureInput {
  version: 1;
  method: "POST";
  url: string;
  headers: { "privy-app-id": string };
  body: { params: { hash: string } };
}

/**
 * Sign a wallet-API request with the user's own key.
 *
 * The wallet is owned by the Privy user, so only their signature authorizes it —
 * the example server holds no signing key of its own. This is the browser
 * equivalent of `useAuthorizationSignature()` in `@privy-io/expo`, which signs
 * natively; here the signing happens inside the embedded-wallet iframe.
 *
 * The signature covers the exact request the server will forward, so the caller
 * builds the payload from the `privyApiUrl` the server reported rather than a
 * constant — see the `buildBody` in the wallet store.
 *
 * @param input - The request to authorize
 * @returns Base64 authorization signature for the server to relay
 */
export async function generateAuthorizationSignature(
  input: AuthorizationSignatureInput
): Promise<{ signature: string }> {
  const c = await ensureClient();
  const { generateAuthorizationSignature: sign } =
    await import("@privy-io/js-sdk-core");
  // The key never reaches page scope; signing happens in the iframe.
  return sign((payload) => c.embeddedWallet.signWithUserSigner(payload), input);
}

export async function logout(): Promise<void> {
  if (!client) return;
  await client.auth.logout();
  loggedIn.set(false);
  codeSent.set(false);
}
