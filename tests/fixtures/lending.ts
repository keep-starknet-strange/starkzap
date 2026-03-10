import { fromAddress, type Token } from "@/types";

export const testLendingCollateralToken: Token = {
  name: "Starknet Token",
  symbol: "STRK",
  decimals: 18,
  address: fromAddress(
    "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"
  ),
};

export const testLendingDebtToken: Token = {
  name: "USD Coin",
  symbol: "USDC",
  decimals: 6,
  address: fromAddress(
    "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8"
  ),
};
