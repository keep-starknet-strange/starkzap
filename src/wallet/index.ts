import {
  Account,
  RpcProvider,
  type Call,
  TransactionFinalityStatus,
} from "starknet";
import { Tx } from "../tx/index.js";
import { AccountProvider } from "./accounts/provider.js";
import type {
  DeployOptions,
  EnsureReadyOptions,
  ExecuteOptions,
  PreflightOptions,
  PreflightResult,
} from "../types/wallet.js";
import type { SDKConfig, SponsorConfig } from "../types/config.js";
import type { SponsorshipRequest } from "../types/sponsorship.js";

/**
 * Represents a connected Starknet wallet.
 * Provides methods for deployment, transaction execution, and preflight checks.
 */
export class Wallet {
  /** The wallet's Starknet address */
  readonly address: string;

  private readonly provider: RpcProvider;
  private readonly account: Account;
  private readonly accountProvider: AccountProvider;
  private readonly config: SDKConfig;
  private readonly sponsor: SponsorConfig | undefined;

  private constructor(
    address: string,
    accountProvider: AccountProvider,
    account: Account,
    provider: RpcProvider,
    config: SDKConfig
  ) {
    this.address = address;
    this.accountProvider = accountProvider;
    this.account = account;
    this.provider = provider;
    this.config = config;
    this.sponsor = config.sponsor;
  }

  /**
   * Create a new Wallet instance.
   * Use this instead of constructor since address computation is async.
   */
  static async create(
    accountProvider: AccountProvider,
    provider: RpcProvider,
    config: SDKConfig
  ): Promise<Wallet> {
    const address = await accountProvider.getAddress();
    const signer = accountProvider.getSigner();

    const account = new Account({
      provider,
      address,
      signer: signer._getStarknetSigner(),
    });

    return new Wallet(address, accountProvider, account, provider, config);
  }

  /**
   * Check if the account contract is deployed on-chain.
   */
  async isDeployed(): Promise<boolean> {
    try {
      const classHash = await this.provider.getClassHashAt(this.address);
      return !!classHash;
    } catch {
      return false;
    }
  }

  /**
   * Ensure the wallet is ready for transactions.
   * Optionally deploys the account if needed.
   */
  async ensureReady(options: EnsureReadyOptions = {}): Promise<void> {
    const { deploy = "if_needed", onProgress } = options;

    onProgress?.({ step: "CONNECTED" });

    onProgress?.({ step: "CHECK_DEPLOYED" });
    const deployed = await this.isDeployed();

    if (deployed && deploy !== "always") {
      onProgress?.({ step: "READY" });
      return;
    }

    if (!deployed && deploy === "never") {
      throw new Error("Account not deployed and deploy mode is 'never'");
    }

    onProgress?.({ step: "DEPLOYING" });
    const tx = await this.deploy(options);
    await tx.wait({
      successStates: [
        TransactionFinalityStatus.ACCEPTED_ON_L2,
        TransactionFinalityStatus.ACCEPTED_ON_L1,
      ],
    });

    onProgress?.({ step: "READY" });
  }

  /**
   * Deploy the account contract.
   * Returns a Tx object to track the deployment.
   */
  async deploy(options: DeployOptions = {}): Promise<Tx> {
    const { feeMode = "user_pays", sponsorPolicyHint } = options;

    const classHash = this.accountProvider.getClassHash();
    const publicKey = await this.accountProvider.getPublicKey();
    const constructorCalldata =
      this.accountProvider.getConstructorCalldata(publicKey);

    if (feeMode === "sponsored" && this.sponsor) {
      await this.requestSponsorship([], sponsorPolicyHint);
      // Note: For account deployment with paymaster, additional logic needed
    }

    const { transaction_hash } = await this.account.deployAccount({
      classHash,
      constructorCalldata,
      addressSalt: publicKey,
    });

    return new Tx(transaction_hash, this.provider, this.config.explorer);
  }

  /**
   * Execute one or more contract calls.
   * Returns a Tx object to track the transaction.
   */
  async execute(calls: Call[], options: ExecuteOptions = {}): Promise<Tx> {
    const { feeMode = "user_pays", sponsorPolicyHint } = options;

    if (feeMode === "sponsored" && this.sponsor) {
      await this.requestSponsorship(calls, sponsorPolicyHint);
      // Note: For sponsored execution, additional paymaster logic needed
    }

    const { transaction_hash } = await this.account.execute(calls);

    return new Tx(transaction_hash, this.provider, this.config.explorer);
  }

  /**
   * Check if an operation can succeed before attempting it.
   */
  async preflight(options: PreflightOptions): Promise<PreflightResult> {
    const { kind, feeMode = "user_pays", calls = [] } = options;

    try {
      // Check deployment status
      const deployed = await this.isDeployed();
      if (!deployed && kind !== "execute") {
        return { ok: false, reason: "Account not deployed" };
      }

      // Check sponsorship availability
      if (feeMode === "sponsored") {
        if (!this.sponsor) {
          return { ok: false, reason: "Sponsor not configured" };
        }
      }

      // Simulate transaction if calls provided
      if (calls.length > 0) {
        const simulation = await this.account.simulateTransaction([
          { type: "INVOKE", payload: calls },
        ]);

        const result = simulation[0];
        if (
          result &&
          "transaction_trace" in result &&
          result.transaction_trace
        ) {
          const trace = result.transaction_trace;
          if (
            "execute_invocation" in trace &&
            trace.execute_invocation &&
            "revert_reason" in trace.execute_invocation
          ) {
            return {
              ok: false,
              reason:
                trace.execute_invocation.revert_reason ?? "Simulation failed",
            };
          }
        }
      }

      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get the underlying starknet.js Account instance.
   */
  getAccount(): Account {
    return this.account;
  }

  private async requestSponsorship(
    calls: Call[],
    policyHint?: { action: string; [key: string]: unknown }
  ) {
    if (!this.sponsor) {
      throw new Error("Sponsor not configured");
    }

    const request: SponsorshipRequest = {
      calls,
      callerAddress: this.address,
      chainId: this.config.chainId,
      policyHint,
    };

    return this.sponsor.getSponsorship(request);
  }
}
