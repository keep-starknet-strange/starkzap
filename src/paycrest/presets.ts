import { mainnetTokens } from "@/erc20/token/presets";
import { ChainId, fromAddress, type Address, type Token } from "@/types";
import type { PaycrestNetwork } from "@/paycrest/types";

/**
 * Paycrest is **mainnet-only** today — there is no sepolia/devnet backend
 * or testnet Cairo Gateway. Helpers in this module throw with a clear
 * "Paycrest does not support testnets" message for any non-mainnet chain.
 */

/** Live Cairo Gateway contract on Starknet mainnet. */
export const PAYCREST_GATEWAY_MAINNET = fromAddress(
  "0x06ff3a3b1532da65594fc98f9ca7200af6c3dbaf37e7339b0ebd3b3f2390c583"
);

/**
 * Numeric chain id the Paycrest aggregator uses for Starknet mainnet
 * in its `networks.chain_id` column. Required by the
 * `GET /v2/orders/{chain_id}/{gateway_id}` lookup endpoint that
 * accepts the on-chain felt252 order id.
 *
 * Starknet's true chain id is the felt `SN_MAIN`
 * (`393402133025997798000961`) which overflows int64, so the aggregator
 * uses a fictional int64 value chosen by Paycrest ops. As of 2026 this
 * is `23448594291968334`.
 *
 * Stored as `bigint` because it exceeds `Number.MAX_SAFE_INTEGER`.
 */
export const STARKNET_MAINNET_CHAIN_ID = 23_448_594_291_968_334n;

/** Resolve the Paycrest aggregator chain id for a Starknet chain. Mainnet only. */
export function paycrestChainIdFor(chainId: ChainId): bigint {
  if (chainId.isMainnet()) return STARKNET_MAINNET_CHAIN_ID;
  throw new Error(
    `Paycrest is mainnet-only — no aggregator chain_id is configured for ${chainId.toLiteral()}.`
  );
}

/**
 * Tokens accepted by the Paycrest Starknet Gateway. Sourced from
 * `GET /v2/tokens?network=starknet` and reconciled with
 * `mainnetTokens` so we don't redefine the same Token shape twice.
 */
export const paycrestMainnetTokens: readonly Token[] = [
  mainnetTokens.USDC,
  mainnetTokens.USDT,
];

/** Resolve the Cairo Gateway address for a chain. Mainnet only. */
export function paycrestGatewayFor(chainId: ChainId): Address {
  if (chainId.isMainnet()) return PAYCREST_GATEWAY_MAINNET;
  throw new Error(
    `Paycrest is mainnet-only — no Gateway is deployed on ${chainId.toLiteral()}. See https://docs.paycrest.io.`
  );
}

/**
 * Map a Starknet `ChainId` to the Paycrest network identifier used in the
 * Sender API (`source.network`, `destination.recipient.network`, and the
 * `{network}` segment of the rates endpoint).
 */
export function paycrestNetworkFor(chainId: ChainId): PaycrestNetwork {
  if (chainId.isMainnet()) return "starknet";
  throw new Error(
    `Paycrest is mainnet-only — ${chainId.toLiteral()} is not a supported network. See https://docs.paycrest.io.`
  );
}

/** Tokens accepted by the Paycrest Gateway on the given chain. Mainnet only. */
export function paycrestTokensFor(chainId: ChainId): readonly Token[] {
  if (chainId.isMainnet()) return paycrestMainnetTokens;
  throw new Error(
    `Paycrest is mainnet-only — no tokens are configured for ${chainId.toLiteral()}.`
  );
}

/**
 * Cartridge session policy entry — the same shape `@cartridge/controller`
 * accepts (a `(target, method)` pair the session is allowed to call
 * without re-prompting). Re-declared locally so callers can consume
 * the helper without depending on the cartridge module.
 */
export interface PaycrestSessionPolicy {
  target: Address;
  method: string;
}

/**
 * Cartridge session policies for a sponsored Paycrest gateway off-ramp.
 *
 * The gateway path emits two calls inside one multicall:
 *   - ERC20 `approve(gateway, amount)` on `token.address`
 *   - `create_order(...)` on the Paycrest Gateway
 *
 * Both must be pre-authorised in the Cartridge session for the wallet
 * to execute the bundle without a popup. Drop the result straight into
 * `sdk.connectCartridge({ policies })`.
 *
 * Mainnet-only — throws on Sepolia.
 *
 * @example
 * ```ts
 * const policies = paycrestGatewaySessionPolicies({
 *   chainId: ChainId.MAINNET,
 *   token: mainnetTokens.USDT,
 * });
 * const wallet = await sdk.connectCartridge({ policies });
 * ```
 */
export function paycrestGatewaySessionPolicies(args: {
  chainId: ChainId;
  token: Token;
}): PaycrestSessionPolicy[] {
  // Fail fast on non-Paycrest tokens: the session would otherwise
  // authorise calls for a flow that's guaranteed to fail later on-chain
  // (the Gateway rejects unsupported tokens in `create_order`).
  const supported = paycrestTokensFor(args.chainId);
  if (!supported.some((t) => t.address === args.token.address)) {
    throw new Error(
      `Token ${args.token.address} is not supported by Paycrest on ${args.chainId.toLiteral()}. Supported: ${supported.map((t) => t.symbol).join(", ")}.`
    );
  }
  return [
    { target: args.token.address, method: "approve" },
    { target: paycrestGatewayFor(args.chainId), method: "create_order" },
  ];
}
