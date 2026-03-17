import { describe, expect, it, vi } from "vitest";
import { BridgeOperator } from "@/bridge/operator/BridgeOperator";
import { type BridgeToken, ExternalChain, Protocol } from "@/types";
import type { ConnectedExternalWallet } from "@/connect";
import type { WalletInterface } from "@/wallet";

type BridgeOperatorPrivate = {
  createBridge(
    token: BridgeToken,
    wallet: ConnectedExternalWallet,
    starknetWallet: WalletInterface
  ): Promise<unknown>;
};

function mockToken(
  overrides: Partial<Pick<BridgeToken, "id" | "name" | "chain" | "protocol">>
): BridgeToken {
  return {
    id: "token",
    name: "Token",
    symbol: "TKN",
    coingeckoId: undefined,
    decimals: 18,
    address: "0x0000000000000000000000000000000000000001",
    bridgeAddress: "0x0000000000000000000000000000000000000002",
    starknetAddress: "0x1",
    starknetBridge: "0x2",
    chain: ExternalChain.ETHEREUM,
    protocol: Protocol.CANONICAL,
    ...overrides,
  } as unknown as BridgeToken;
}

describe("BridgeOperator", () => {
  it("createBridge should reject when token and wallet chains do not match", async () => {
    const starknetWallet = {} as WalletInterface;
    const operator = new BridgeOperator(starknetWallet);
    const operatorPrivate = operator as unknown as BridgeOperatorPrivate;
    const token = mockToken({
      name: "USDC",
      chain: ExternalChain.ETHEREUM,
      protocol: Protocol.CANONICAL,
    });
    const wallet = {
      chain: ExternalChain.SOLANA,
    } as unknown as ConnectedExternalWallet;

    await expect(
      operatorPrivate.createBridge(token, wallet, starknetWallet)
    ).rejects.toThrow(
      "Attempting to bridge USDC on ethereum but external connected wallet is on chain solana"
    );
  });

  it("createBridge should reject OFT bridges when LayerZero API key is missing", async () => {
    const starknetWallet = {} as WalletInterface;
    const operator = new BridgeOperator(starknetWallet, {
      ethereumRpcUrl: "https://rpc.example.com",
    });
    const operatorPrivate = operator as unknown as BridgeOperatorPrivate;
    const token = mockToken({
      id: "usdc",
      chain: ExternalChain.ETHEREUM,
      protocol: Protocol.OFT,
    });
    const toEthWalletConfig = vi.fn().mockResolvedValue({
      provider: {},
      signer: {},
    });
    const wallet = {
      chain: ExternalChain.ETHEREUM,
      toEthWalletConfig,
    } as unknown as ConnectedExternalWallet;

    await expect(
      operatorPrivate.createBridge(token, wallet, starknetWallet)
    ).rejects.toThrow("OFT bridging requires a LayerZero API key");
    expect(toEthWalletConfig).toHaveBeenCalledTimes(1);
  });
});
