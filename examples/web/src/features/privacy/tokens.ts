import { derived } from "svelte/store";
import { TONGO_CONTRACTS } from "~/lib/stores/config";
import { tokens } from "~/lib/stores/tokens";

export interface PrivacyToken {
  symbol: string;
  contractAddress: string;
  decimals: number;
}

/**
 * Tokens usable with Tongo: the shared list intersected with the tokens that
 * have a Tongo contract on this network.
 *
 * Tongo deploys one contract per token, so — unlike the STRK20 pool, which
 * serves every token — importing an arbitrary ERC20 does not make it available
 * here.
 */
export const tongoTokens = derived(tokens, ($tokens) =>
  $tokens
    .filter((t) => TONGO_CONTRACTS[t.symbol])
    .map(
      (t): PrivacyToken => ({
        symbol: t.symbol,
        contractAddress: TONGO_CONTRACTS[t.symbol]!,
        decimals: t.decimals,
      })
    )
);
