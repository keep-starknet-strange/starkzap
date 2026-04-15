export const DEFAULT_OFT_DEPOSIT_GAS_REQUIREMENT = 250_000n;

export const DEFAULT_OFT_MIN_AMOUNT = "100";

/** Per-token min amount for dummy approval/deposit quotes (raw/smallest unit). */
export const OFT_MIN_AMOUNT_BY_TOKEN_ID: Record<string, string> = {
  solvbtc: "10000000000",
};
