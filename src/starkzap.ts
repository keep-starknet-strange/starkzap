import { Creator } from './creator';
import type { CreatorConfig, TipButtonConfig } from './creator/types';

export class StarkZap {
  constructor() {}

  /**
   * Create a new Creator instance for cross-chain tipping and monetization.
   * 
   * @example
   * const creator = starkzap.creator({
   *   starknetAddress: "0x...",
   *   displayName: "MyAwesomeCreator",
   * });
   */
  creator(config: CreatorConfig): Creator {
    return new Creator(config);
  }

  /**
   * Quick tip button for a creator.
   * 
   * @example
   * const html = starkzap.tipButton({
   *   starknetAddress: "0x...",
   *   displayName: "MyAwesomeCreator",
   *   tokens: ["USDC", "STRK"],
   *   chains: ["base", "starknet"],
   *   suggestedAmounts: ["1", "5", "10"],
   * });
   */
  tipButton(config: {
    starknetAddress: string;
    displayName: string;
  } & TipButtonConfig): string {
    const creator = this.creator(config as CreatorConfig);
    return creator.renderTipButton(config as TipButtonConfig);
  }
}

export function createStarkZap(): StarkZap {
  return new StarkZap();
}

export const starkzap = createStarkZap();
