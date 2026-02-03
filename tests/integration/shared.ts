import { Amount } from "@/types";
import type { Wallet } from "@/wallet";
import { sepoliaTokens } from "@/erc20";

/**
 * Fund an account using devnet's mint endpoint.
 */
export async function fund(
  wallet: Wallet,
  amount: Amount = Amount.parse(100, sepoliaTokens.STRK!)
) {
  let unit: string;

  if (amount.getSymbol() === "ETH") {
    unit = "WEI";
  } else if (amount.getSymbol() === "STRK") {
    unit = "FRI";
  } else {
    throw new Error("Cannot fund other token rather than STRK or ETH");
  }
  const response = await fetch(wallet.getProvider().channel.nodeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "devnet_mint",
      params: {
        address: wallet.address,
        amount: Number(amount.toBase()),
        unit: unit,
      },
      id: 1,
    }),
  });
  const result = await response.json();
  if (result.error) {
    throw new Error(result.error.message);
  }
  return result;
}

export function forkRPC(version: string): string | null {
  const env = process.env.FORK_NETWORK;
  if (!env) {
    return null;
  }
  const url = new URL(env);

  // Pattern to match /rpc/v{major}_{minor} at the end of pathname
  const rpcVersionPattern = /\/rpc\/v\d+_\d+$/;

  if (rpcVersionPattern.test(url.pathname)) {
    // Replace existing version
    url.pathname = url.pathname.replace(rpcVersionPattern, `/rpc/${version}`);
  } else {
    // Append version (remove trailing slash if present)
    url.pathname = url.pathname.replace(/\/$/, "") + `/rpc/${version}`;
  }

  return url.toString();
}
