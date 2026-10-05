import { mainnetTokens } from "@/erc20/token/presets";
import { ChainId, type Address, type Token } from "@/types";
import type { PaycrestNetwork } from "@/paycrest/types";

/**
 * Paycrest is **mainnet-only** today — there is no sepolia/devnet backend.
 * Helpers in this module throw with a clear "Paycrest is mainnet-only"
 * message for any non-mainnet chain.
 */

/**
 * Tokens Paycrest accepts on Starknet. Sourced from
 * `GET /v2/tokens?network=starknet` and reconciled with
 * `mainnetTokens` so we don't redefine the same Token shape twice.
 */
export const paycrestMainnetTokens: readonly Token[] = [
  mainnetTokens.USDC,
  mainnetTokens.USDT,
];

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

/** Tokens Paycrest accepts on the given chain. Mainnet only. */
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
 * Cartridge session policies for a sponsored Paycrest off-ramp.
 *
 * An off-ramp funds the order with a single ERC20 `transfer` to the
 * receive address the Sender API assigns, so the session needs
 * `transfer` on the token. Drop the result straight into
 * `sdk.connectCartridge({ policies })`.
 *
 * Mainnet-only — throws on Sepolia, and on tokens Paycrest doesn't accept.
 *
 * @example
 * ```ts
 * const policies = paycrestOfframpSessionPolicies({
 *   chainId: ChainId.MAINNET,
 *   token: mainnetTokens.USDT,
 * });
 * const wallet = await sdk.connectCartridge({ policies });
 * ```
 */
export function paycrestOfframpSessionPolicies(args: {
  chainId: ChainId;
  token: Token;
}): PaycrestSessionPolicy[] {
  // Fail fast on non-Paycrest tokens: the session would otherwise
  // authorise a transfer for an order the Sender API will reject.
  const supported = paycrestTokensFor(args.chainId);
  if (!supported.some((t) => t.address === args.token.address)) {
    throw new Error(
      `Token ${args.token.address} is not supported by Paycrest on ${args.chainId.toLiteral()}. Supported: ${supported.map((t) => t.symbol).join(", ")}.`
    );
  }
  return [{ target: args.token.address, method: "transfer" }];
}
