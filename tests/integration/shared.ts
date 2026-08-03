import { Amount, ChainId, type ChainIdLiteral, type SDKConfig } from "@/types";
import type { Wallet } from "@/wallet";
import { sepoliaTokens } from "@/erc20";

/**
 * Fund an account using devnet's mint endpoint.
 */
export async function fund(
  wallet: Wallet,
  amount: Amount = Amount.parse(100, sepoliaTokens.STRK)
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

export type TestConfig = {
  rpcUrl: string;
  chainId: ChainIdLiteral;
};

export function toSdkConfig(testConfig: TestConfig): SDKConfig {
  return {
    rpcUrl: testConfig.rpcUrl,
    chainId: ChainId.from(testConfig.chainId),
  };
}
