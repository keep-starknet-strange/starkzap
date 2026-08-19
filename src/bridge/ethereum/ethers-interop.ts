import type { PreparedTransactionRequest, Provider, Signer } from "ethers";
import type { ConnectedEthereumWallet } from "@/connect/evm";
import { loadEthers } from "@/connect/ethersRuntime";

/**
 * Everything in the Ethereum bridge that names `ethers` types directly.
 *
 * Kept out of `@/bridge/ethereum/types` and out of `@/bridge/ethereum`'s barrel
 * on purpose. `ethers` is an optional peer, and a declaration file that names it
 * has to resolve for anyone who reaches it — so a consumer who never bridges
 * would need `ethers` installed just to typecheck against this package.
 *
 * The fee-estimation types next door are part of `BridgeDepositFeeEstimation`
 * and its siblings, which every consumer reaches through `wallet.deposit()` and
 * friends. Sharing a file with these would drag `ethers` in behind them.
 *
 * Nothing here is integrator-facing. `BridgeOperator` builds the config and
 * hands it to the bridge classes, none of which are exported either.
 */

/** Signer and provider an Ethereum bridge acts through. */
export type EthereumWalletConfig = {
  signer: Signer;
  provider: Provider;
};

/** A prepared L1 contract call, with the method and arguments it encodes. */
export type EthereumTransactionDetails = {
  method: string;
  args: string[];
  transaction: PreparedTransactionRequest;
};

/**
 * Turn a connected EVM wallet into the signer and provider a bridge acts through.
 *
 * A function here rather than a method on {@link ConnectedEthereumWallet},
 * because the return type names `ethers`: as a method it put the optional peer
 * into the declaration of a class that every consumer reaches through
 * `wallet.deposit()`, whether or not they bridge.
 *
 * @param wallet - Connected EVM wallet to read the chain id, address and
 *   EIP-1193 provider from
 * @param ethereumRpcUrl - Read through this RPC instead of the wallet's own
 *   provider. Signing still goes through the wallet either way.
 * @returns The signer and provider for a bridge on the wallet's chain
 * @throws If the wallet reports a different chain than it was created for, or if
 *   `ethereumRpcUrl` points at another chain
 */
export async function toEthWalletConfig(
  wallet: ConnectedEthereumWallet,
  ethereumRpcUrl?: string | undefined
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
