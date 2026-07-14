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
  const { user } = await client.user.get();
  loggedIn.set(!!user);
  ready.set(true);
  return client;
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

export async function logout(): Promise<void> {
  if (!client) return;
  await client.auth.logout();
  loggedIn.set(false);
  codeSent.set(false);
}
