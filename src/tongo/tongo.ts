import type { Address, ExecuteOptions, Amount } from "@/types";
import type { WalletInterface } from "@/wallet";
import type { Tx } from "@/tx";
import type {
  TongoConfig,
  TongoAccountState,
  ProjectivePoint,
  CipherBalance,
  ConfidentialTransfer,
} from "./types";
import { Contract, type RpcProvider, type Call, num } from "starknet";
import { ABI as TONGO_ABI } from "@/abi/tongo";

/**
 * Tongo confidential account operations.
 *
 * Tongo is a confidential payment system for ERC20 tokens on Starknet.
 * It uses ElGamal encryption and zero-knowledge proofs to enable
 * privacy-preserving transactions while maintaining auditability.
 *
 * @example
 * ```ts
 * import { Tongo } from "starkzap";
 *
 * // Create Tongo instance
 * const tongo = new Tongo(tongoConfig, provider);
 *
 * // Fund a confidential account (public -> private)
 * const tx = await tongo.fund(wallet, amount);
 *
 * // Transfer confidentially
 * const tx = await tongo.transfer(wallet, {
 *   to: recipientPublicKey,
 *   amount: transferAmount,
 * });
 *
 * // Withdraw (private -> public)
 * const tx = await tongo.withdraw(wallet, amount, recipientAddress);
 * ```
 *
 * @see https://docs.tongo.cash/
 */
export class Tongo {
  private readonly config: TongoConfig;
  private readonly provider: RpcProvider;
  private contract: Contract;

  constructor(config: TongoConfig, provider: RpcProvider) {
    this.config = config;
    this.provider = provider;
    this.contract = new Contract({
      abi: TONGO_ABI,
      address: config.address,
      providerOrAccount: provider,
    });
  }

  /**
   * Get the Tongo contract address.
   */
  get address(): Address {
    return this.config.address;
  }

  /**
   * Get the underlying ERC20 token address.
   */
  get token(): Address {
    return this.config.token;
  }

  /**
   * Get an account's state from the contract.
   *
   * @param publicKey - The account's public key
   * @returns The account state or null if not found
   */
  async getAccountState(
    publicKey: ProjectivePoint
  ): Promise<TongoAccountState | null> {
    try {
      const accountKey = this.pointToContractFormat(publicKey);
      const state = await this.contract.get_account(accountKey);

      if (!state || !state.current_balance) {
        return null;
      }

      const result: TongoAccountState = {
        publicKey,
        currentBalance: this.cipherFromContract(state.current_balance),
        pendingBalance: this.cipherFromContract(state.pending_balance),
        nonce: num.toBigInt(state.nonce),
      };

      // Only include aeBalance if present
      if (state.ae_balance) {
        result.aeBalance = {
          ciphertext: num.toBigInt(state.ae_balance.ciphertext),
          nonce: num.toBigInt(state.ae_balance.nonce),
        };
      }

      return result;
    } catch {
      // Account doesn't exist yet
      return null;
    }
  }

  /**
   * Fund a Tongo account with ERC20 tokens.
   *
   * Converts public ERC20 tokens to confidential Tongos.
   * The amount is publicly visible on-chain but encrypted in the Tongo balance.
   *
   * @param wallet - The wallet to fund from (must own the Tongo account)
   * @param amount - The amount of tokens to fund
   * @param options - Execution options
   * @returns The transaction
   *
   * @example
   * ```ts
   * const tx = await tongo.fund(wallet, Amount.parse("100", USDC));
   * await tx.wait();
   * ```
   */
  async fund(
    wallet: WalletInterface,
    amount: Amount,
    options?: ExecuteOptions
  ): Promise<Tx> {
    // Build the fund call
    const amountRaw = amount.toBase();

    // The fund call requires the Tongo public key
    // This should be derived from the wallet's private key
    const calls: Call[] = [
      {
        contractAddress: this.config.address,
        entrypoint: "fund",
        calldata: [amountRaw],
      },
    ];

    return await wallet.execute(calls, options);
  }

  /**
   * Perform a confidential transfer between Tongo accounts.
   *
   * The amount is hidden from the public, only visible to sender and recipient.
   *
   * @param wallet - The sender wallet
   * @param transfer - Transfer details (recipient public key and amount)
   * @param options - Execution options
   * @returns The transaction
   *
   * @example
   * ```ts
   * const tx = await tongo.transfer(wallet, {
   *   to: recipientPublicKey,
   *   amount: 1000000n, // in base units
   * });
   * await tx.wait();
   * ```
   */
  async transfer(
    wallet: WalletInterface,
    transfer: ConfidentialTransfer,
    options?: ExecuteOptions
  ): Promise<Tx> {
    const calls: Call[] = [
      {
        contractAddress: this.config.address,
        entrypoint: "transfer",
        calldata: [this.pointToCalldata(transfer.to), transfer.amount].flat(),
      },
    ];

    return await wallet.execute(calls, options);
  }

  /**
   * Withdraw Tongos back to public ERC20 tokens.
   *
   * The withdrawn amount becomes publicly visible on-chain.
   *
   * @param wallet - The wallet to withdraw from
   * @param amount - The amount to withdraw
   * @param to - The recipient Starknet address (optional, defaults to wallet address)
   * @param options - Execution options
   * @returns The transaction
   *
   * @example
   * ```ts
   * const tx = await tongo.withdraw(wallet, Amount.parse("50", USDC));
   * await tx.wait();
   * ```
   */
  async withdraw(
    wallet: WalletInterface,
    amount: Amount,
    to?: Address,
    options?: ExecuteOptions
  ): Promise<Tx> {
    const recipient = to ?? wallet.address;
    const amountRaw = amount.toBase();

    const calls: Call[] = [
      {
        contractAddress: this.config.address,
        entrypoint: "withdraw",
        calldata: [recipient, amountRaw],
      },
    ];

    return await wallet.execute(calls, options);
  }

  /**
   * Rollover pending balance to current balance.
   *
   * After receiving confidential transfers, the pending balance must be
   * rolled over to become spendable. This operation proves ownership
   * of the private key and updates the current balance.
   *
   * @param wallet - The wallet owning the Tongo account
   * @param options - Execution options
   * @returns The transaction
   *
   * @example
   * ```ts
   * // After receiving transfers, rollover to make funds spendable
   * const tx = await tongo.rollover(wallet);
   * await tx.wait();
   * ```
   */
  async rollover(
    wallet: WalletInterface,
    options?: ExecuteOptions
  ): Promise<Tx> {
    const calls: Call[] = [
      {
        contractAddress: this.config.address,
        entrypoint: "rollover",
        calldata: [],
      },
    ];

    return await wallet.execute(calls, options);
  }

  /**
   * Emergency withdrawal of all funds.
   *
   * Withdraws the entire balance (current + pending) to a specified address.
   * This is useful for account recovery or migration.
   *
   * @param wallet - The wallet owning the Tongo account
   * @param to - The recipient Starknet address
   * @param options - Execution options
   * @returns The transaction
   *
   * @example
   * ```ts
   * const tx = await tongo.ragequit(wallet, recipientAddress);
   * await tx.wait();
   * ```
   */
  async ragequit(
    wallet: WalletInterface,
    to: Address,
    options?: ExecuteOptions
  ): Promise<Tx> {
    const calls: Call[] = [
      {
        contractAddress: this.config.address,
        entrypoint: "ragequit",
        calldata: [to],
      },
    ];

    return await wallet.execute(calls, options);
  }

  /**
   * Build a fund call for transaction batching.
   *
   * @internal Used by TxBuilder
   */
  public populateFund(amount: bigint): Call {
    return {
      contractAddress: this.config.address,
      entrypoint: "fund",
      calldata: [amount],
    };
  }

  /**
   * Build a transfer call for transaction batching.
   *
   * @internal Used by TxBuilder
   */
  public populateTransfer(transfer: ConfidentialTransfer): Call {
    return {
      contractAddress: this.config.address,
      entrypoint: "transfer",
      calldata: [this.pointToCalldata(transfer.to), transfer.amount].flat(),
    };
  }

  /**
   * Build a withdraw call for transaction batching.
   *
   * @internal Used by TxBuilder
   */
  public populateWithdraw(amount: bigint, to: Address): Call {
    return {
      contractAddress: this.config.address,
      entrypoint: "withdraw",
      calldata: [to, amount],
    };
  }

  /**
   * Build a rollover call for transaction batching.
   *
   * @internal Used by TxBuilder
   */
  public populateRollover(): Call {
    return {
      contractAddress: this.config.address,
      entrypoint: "rollover",
      calldata: [],
    };
  }

  // ============================================================
  // Private helpers
  // ============================================================

  /**
   * Convert a projective point to contract storage format.
   */
  private pointToContractFormat(point: ProjectivePoint): {
    x: bigint;
    y: bigint;
  } {
    return {
      x: point.x,
      y: point.y,
    };
  }

  /**
   * Convert a projective point to calldata array format.
   */
  private pointToCalldata(point: ProjectivePoint): [bigint, bigint] {
    return [point.x, point.y];
  }

  /**
   * Convert contract cipher balance to our type.
   */
  private cipherFromContract(cipher: {
    L: { x: bigint; y: bigint };
    R: { x: bigint; y: bigint };
  }): CipherBalance {
    return {
      L: { x: cipher.L.x, y: cipher.L.y },
      R: { x: cipher.R.x, y: cipher.R.y },
    };
  }
}
