import { type Address, Amount, type ExecuteOptions, type Token } from "@/types";
import type { WalletInterface } from "@/wallet";
import {
  type Call,
  Contract,
  num,
  RpcError,
  type RpcProvider,
  type TypedContractV2,
  type Uint256,
  uint256,
} from "starknet";
import type { Tx } from "@/tx";
import { ABI as ERC20_ABI } from "@/abi/erc20";

/**
 * ERC20 token interaction helper.
 *
 * Provides methods for common ERC20 operations: approvals, transfers,
 * and balance queries. Handles both `balance_of` (snake_case) and
 * `balanceOf` (camelCase) entrypoints for maximum compatibility.
 *
 * Instances are cached per-token on the wallet via `wallet.erc20(token)`.
 *
 * @example
 * ```ts
 * // Via wallet (recommended)
 * const balance = await wallet.balanceOf(USDC);
 * const tx = await wallet.transfer(USDC, [
 *   { to: recipient, amount: Amount.parse("100", USDC) },
 * ]);
 *
 * // Direct usage
 * const erc20 = new Erc20(USDC, provider);
 * const balance = await erc20.balanceOf(wallet);
 * ```
 */
export class Erc20 {
  private readonly token: Token;
  private readonly contract: TypedContractV2<typeof ERC20_ABI>;

  constructor(token: Token, provider: RpcProvider) {
    this.token = token;
    this.contract = new Contract({
      abi: ERC20_ABI,
      address: this.token.address,
      providerOrAccount: provider,
    }).typedv2(ERC20_ABI);
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
   * Build an ERC20 approve Call without executing.
   *
   * @internal Used by {@link TxBuilder} — not part of the public API.
   */
  public populateApprove(spender: Address, amount: Amount): Call {
    this.validateAmount(amount);
    return this.contract.populateTransaction.approve(
      spender,
      uint256.bnToUint256(amount.toBase())
    );
  }

  /**
   * Build transfer Call(s) without executing.
   *
   * @internal Used by {@link TxBuilder} — not part of the public API.
   */
  public populateTransfer(
    transfers: { to: Address; amount: Amount }[]
  ): Call[] {
    return transfers.map((transfer) => {
      this.validateAmount(transfer.amount);
      return this.contract.populateTransaction.transfer(
        transfer.to,
        uint256.bnToUint256(transfer.amount.toBase())
      );
    });
  }

  /**
   * Transfer tokens to one or more addresses.
   * @param from - Wallet to transfer tokens from
   * @param transfers - Array of transfer objects, each containing a to address and an Amount
   * @param options - Optional execution options
   *
   * @example
   * ```ts
   * const erc20 = wallet.erc20(USDC);
   * const amount = Amount.parse("100", USDC);
   *
   * const tx = await erc20.transfer(wallet, [
   *   { to: recipientAddress, amount },
   * ]);
   * await tx.wait();
   * ```
   *
   * @throws Error if any amount's decimals or symbol don't match the token
   */
  public async transfer(
    from: WalletInterface,
    transfers: { to: Address; amount: Amount }[],
    options?: ExecuteOptions
  ): Promise<Tx> {
    const calls = this.populateTransfer(transfers);
    return await from.execute(calls, options);
  }

  /**
   * Get the balance in a wallet.
   * @param wallet - Wallet to check the balance of
   * @returns Amount representing the token balance
   *
   * @example
   * ```ts
   * const erc20 = wallet.erc20(USDC);
   * const balance = await erc20.balanceOf(wallet);
   *
   * console.log(balance.toUnit());      // "100.5"
   * console.log(balance.toFormatted()); // "100.5 USDC"
   * ```
   */
  public async balanceOf(wallet: WalletInterface): Promise<Amount> {
    let result: number | bigint | Uint256;
    try {
      result = await this.contract.balance_of(wallet.address);
    } catch (error) {
      if (error instanceof RpcError && error.isType("ENTRYPOINT_NOT_FOUND")) {
        result = await this.contract.balanceOf(wallet.address);
      } else {
        throw error;
      }
    }

    if (num.isBigNumberish(result)) {
      return Amount.fromRaw(num.toBigInt(result), this.token);
    } else {
      return Amount.fromRaw(uint256.uint256ToBN(result), this.token);
    }
  }
}
