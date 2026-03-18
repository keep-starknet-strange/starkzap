import type { Call } from "starknet";
import { Account as TongoAccount } from "@fatsolutions/tongo-sdk";
import type { ConfidentialProvider } from "@/confidential/interface";
import type { Amount } from "@/types/amount";
import type {
  ConfidentialConfig,
  ConfidentialFundDetails,
  ConfidentialTransferDetails,
  ConfidentialWithdrawDetails,
  ConfidentialRagequitDetails,
  ConfidentialRolloverDetails,
  ConfidentialState,
  ConfidentialRecipient,
} from "@/confidential/types";

/** Tongo implementation of {@link ConfidentialProvider}. */
export class TongoConfidential implements ConfidentialProvider {
  readonly id = "tongo";
  private readonly account: TongoAccount;

  constructor(config: ConfidentialConfig) {
    // Cast needed: starkzap uses starknet v9 while tongo-sdk uses v8.
    // The Provider types are runtime-compatible but differ in private fields.
    this.account = new TongoAccount(
      config.privateKey,
      config.contractAddress,
      config.provider as never
    );
  }

  get address(): string {
    return this.account.tongoAddress();
  }

  get recipientId(): ConfidentialRecipient {
    return this.account.publicKey;
  }

  async getState(): Promise<ConfidentialState> {
    return await this.account.state();
  }

  async getNonce(): Promise<bigint> {
    return await this.account.nonce();
  }

  async toConfidentialUnits(amount: Amount): Promise<bigint> {
    return await this.account.erc20ToTongo(amount.toBase());
  }

  async toPublicUnits(confidentialAmount: bigint): Promise<bigint> {
    return await this.account.tongoToErc20(confidentialAmount);
  }

  async fund(details: ConfidentialFundDetails): Promise<Call[]> {
    const op = await this.account.fund({
      amount: details.amount.toBase(),
      sender: details.sender,
      ...(details.feeTo !== undefined && { fee_to_sender: details.feeTo }),
    });
    return op.approve ? [op.approve, op.toCalldata()] : [op.toCalldata()];
  }

  async transfer(details: ConfidentialTransferDetails): Promise<Call[]> {
    const op = await this.account.transfer({
      amount: details.amount.toBase(),
      to: details.to,
      sender: details.sender,
      ...(details.feeTo !== undefined && { fee_to_sender: details.feeTo }),
    });
    return [op.toCalldata()];
  }

  async withdraw(details: ConfidentialWithdrawDetails): Promise<Call[]> {
    const op = await this.account.withdraw({
      amount: details.amount.toBase(),
      to: details.to,
      sender: details.sender,
      ...(details.feeTo !== undefined && { fee_to_sender: details.feeTo }),
    });
    return [op.toCalldata()];
  }

  /** Emergency full withdrawal. Tongo-specific. */
  async ragequit(details: ConfidentialRagequitDetails): Promise<Call[]> {
    const op = await this.account.ragequit({
      to: details.to,
      sender: details.sender,
      ...(details.feeTo !== undefined && { fee_to_sender: details.feeTo }),
    });
    return [op.toCalldata()];
  }

  /** Activate pending balance. Tongo-specific. */
  async rollover(details: ConfidentialRolloverDetails): Promise<Call[]> {
    const op = await this.account.rollover({
      sender: details.sender,
    });
    return [op.toCalldata()];
  }

  /** Access the underlying Tongo Account for advanced operations. */
  getTongoAccount(): TongoAccount {
    return this.account;
  }
}
