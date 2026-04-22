import type { EthereumWalletConfig } from "@/bridge/ethereum/types";
import { loadEthers } from "@/connect/ethersRuntime";
import type { ConnectedEthereumWallet } from "@/connect/evm";

export async function resolveEthereumWalletConfig(
  wallet: ConnectedEthereumWallet,
  ethereumRpcUrl?: string
): Promise<EthereumWalletConfig> {
  const ethers = await loadEthers("Ethereum bridge operations");
  const ethChainIdRaw = await wallet.provider.request<string>({
    method: "eth_chainId",
  });
  const ethChainId = Number(BigInt(ethChainIdRaw));
  const networkId: number = wallet.network;

  if (ethChainId !== networkId) {
    throw new Error(
      `Cannot create Ethereum Bridge. Expected ethereum chain id to be ${networkId} but got ${ethChainId}.`
    );
  }

  const browserProvider = new ethers.BrowserProvider(
    wallet.provider,
    networkId
  );
  const signer = await browserProvider.getSigner(wallet.address);

  let provider;
  if (ethereumRpcUrl) {
    const rpcProvider = new ethers.JsonRpcProvider(ethereumRpcUrl, networkId);
    const rpcNetwork = await rpcProvider.getNetwork();
    const rpcChainId = Number(rpcNetwork.chainId);

    if (rpcChainId !== networkId) {
      throw new Error(
        `Custom Ethereum RPC URL is on chain ${rpcChainId} but the connected wallet is on chain ${networkId}.`
      );
    }
    provider = rpcProvider;
  } else {
    provider = browserProvider;
  }

  return { provider, signer };
}
