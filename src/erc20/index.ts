import type { WalletInterface } from "@/wallet";
import type { Address, ExecuteOptions, Token } from "@/types";
import { Amount } from "@/types";
import { type Call, CallData, uint256 } from "starknet";
import type { Tx } from "@/tx";

export class Erc20 {
  private readonly token: Token;

  constructor(token: Token) {
    this.token = token;
  }

  /**
   * Validates that an Amount matches this ERC20 token's configuration.
   * @param amount - The Amount to validate
   * @throws Error if decimals or symbol don't match the token
   */
  private validateAmount(amount: Amount): void {
    const amountDecimals = amount.getDecimals();
    const amountSymbol = amount.getSymbol();

    if (amountDecimals !== this.token.decimals) {
      throw new Error(
        `Amount decimals mismatch: expected ${this.token.decimals} (${this.token.symbol}), got ${amountDecimals}`
      );
    }

    // Only validate symbol if the amount has one set
    if (amountSymbol !== undefined && amountSymbol !== this.token.symbol) {
      throw new Error(
        `Amount symbol mismatch: expected "${this.token.symbol}", got "${amountSymbol}"`
      );
    }
  }

  /**
   * Transfer tokens to one or more addresses.
   * @param args.from - Wallet to transfer tokens from
   * @param args.transfers - Array of transfer objects, each containing a to address and an Amount
   * @param args.options - Optional execution options
   *
   * @example
   * ```ts
   * import { Erc20, Amount, USDC } from "x";
   *
   * const erc20 = new Erc20(USDC);
   * const amount = Amount.parse("100", USDC);
   *
   * await erc20.transfer({
   *   from: wallet,
   *   transfers: [{ to: recipientAddress, amount }],
   * });
   * ```
   *
   * @throws Error if any amount's decimals or symbol don't match the token
   */
  public async transfer(args: {
    from: WalletInterface;
    transfers: { to: Address; amount: Amount }[];
    options?: ExecuteOptions;
  }): Promise<Tx> {
    const calls: Call[] = args.transfers.map((transfer) => {
      // Validate that the amount matches this token
      this.validateAmount(transfer.amount);

      return {
        contractAddress: this.token.address,
        entrypoint: "transfer",
        calldata: CallData.compile([
          transfer.to,
          uint256.bnToUint256(transfer.amount.toBase()),
        ]),
      };
    });

    return await args.from.execute(calls, args.options);
  }

  /**
   * Get the balance in a wallet.
   * @param args.wallet - Wallet to check the balance of
   * @returns Amount representing the token balance
   *
   * @example
   * ```ts
   * import { Erc20, USDC } from "x";
   *
   * const erc20 = new Erc20(USDC);
   * const balance = await erc20.balanceOf({ wallet });
   *
   * console.log(balance.toUnit());      // "100.5"
   * console.log(balance.toFormatted()); // "100.5 USDC"
   * ```
   */
  public async balanceOf(args: { wallet: WalletInterface }): Promise<Amount> {
    const provider = args.wallet.getProvider();
    const address = args.wallet.address;
    const result = await provider.callContract({
      contractAddress: this.token.address,
      entrypoint: "balanceOf",
      calldata: CallData.compile([address]),
    });
    const balance = uint256.uint256ToBN({
      low: result[0] as string,
      high: result[1] as string,
    });

    return Amount.fromRaw(balance, this.token);
  }
}
