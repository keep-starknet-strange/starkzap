import type { PreparedTransactionRequest, Provider, Signer } from "ethers";

/**
 * The Ethereum bridge types that name `ethers` types directly.
 *
 * Kept out of `@/bridge/ethereum/types` and out of `@/bridge/ethereum`'s barrel
 * on purpose. `ethers` is an optional peer, and a declaration file that names it
 * has to resolve for anyone who reaches it — so a consumer who never bridges
 * would need `ethers` installed just to typecheck against this package.
 *
 * The fee-estimation types next door are part of `BridgeDepositFeeEstimation`
 * and its siblings, which every consumer reaches through `wallet.deposit()` and
 * friends. Sharing a file with these two would drag `ethers` in behind them.
 *
 * Nothing here is part of the integrator-facing API: `BridgeOperator` builds the
 * config from `ConnectedEthereumWallet.toEthWalletConfig()` and hands it to the
 * bridge classes, none of which are exported either.
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
