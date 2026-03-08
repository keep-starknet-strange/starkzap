import { PrivyClient } from "@privy-io/node";

/**
 * Shared Privy client for server-side API routes.
 *
 * Uses server-only environment variables:
 * - PRIVY_APP_ID: Your Privy application ID (server-only)
 * - PRIVY_APP_SECRET: Your Privy application secret (server-only)
 *
 * Note: Do NOT use NEXT_PUBLIC_PRIVY_APP_ID in server routes.
 * The NEXT_PUBLIC_ prefix exposes values to the client.
 */
let privyClient: PrivyClient | null = null;

export function getPrivyClient(): PrivyClient {
  if (!privyClient) {
    const appId = process.env.PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;

    if (!appId || !appSecret) {
      throw new Error(
        "PRIVY_APP_ID and PRIVY_APP_SECRET must be set in environment variables. " +
          "Do not use NEXT_PUBLIC_PRIVY_APP_ID for server-side code."
      );
    }

    privyClient = new PrivyClient({
      appId,
      appSecret,
    });
  }
  return privyClient;
}
