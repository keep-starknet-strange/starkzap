import { EthereumBridge } from "@/bridge/ethereum/EthereumBridge";
import type {
  CompleteBridgeWithdrawOptions,
  InitiateBridgeWithdrawOptions,
} from "@/bridge/types/BridgeInterface";
import {
  Amount,
  type ContractRoutedEthereumBridgeToken,
  type ExternalAddress,
  type ExternalTransactionResponse,
} from "@/types";
import type {
  EthereumCompleteWithdrawFeeEstimation,
  EthereumTransactionDetails,
  EthereumWalletConfig,
} from "@/bridge/ethereum/types";
import type { Contract, ContractTransaction, InterfaceAbi } from "ethers";
import { requireEthers } from "@/connect/ethersRuntime";
import { FeeErrorCause } from "@/types/errors";
import type { WalletInterface } from "@/wallet";
import CANONICAL_BRIDGE_ABI from "@/abi/ethereum/canonicalBridge.json";
import { type Call, CallData, uint256 } from "starknet";
import type { Tx } from "@/tx";
import type { StarkZapLogger } from "@/logger";

/**
 * Base class for Ethereum bridges that route through a fixed on-chain bridge
 * contract (canonical StarkGate, Lords, OFT). It owns the L1 bridge `Contract`
 * and the shared withdraw machinery that talks to it.
 *
 * Protocols that do not route through a bridge contract — CCTP (its own message
 * transmitter) and Layerswap (a per-swap deposit address from the API) — extend
 * {@link EthereumBridge} directly and never construct this contract. Because the
 * token is a {@link ContractRoutedEthereumBridgeToken}, the bridge addresses are
 * present by type, so no runtime guards are needed.
 */
export abstract class ContractRoutedEthereumBridge extends EthereumBridge {
  declare protected readonly bridgeToken: ContractRoutedEthereumBridgeToken;
  protected readonly bridge: Contract;

  constructor(
    bridgeToken: ContractRoutedEthereumBridgeToken,
    config: EthereumWalletConfig,
    starknetWallet: WalletInterface,
    logger: StarkZapLogger,
    bridgeAbi: InterfaceAbi = CANONICAL_BRIDGE_ABI
  ) {
    super(bridgeToken, config, starknetWallet, logger);
    // Sync accessor is safe: bridges are only constructed after
    // `BridgeOperator.createEthereumBridge` has awaited `loadEthers`, and the
    // `config.signer` passed in is itself an ethers object.
    const { Contract } = requireEthers("Ethereum bridge construction");
    this.bridge = new Contract(
      bridgeToken.bridgeAddress,
      bridgeAbi,
      config.signer
    );
  }

  /**
   * Initiate a withdrawal from Starknet to Ethereum by calling
   * `initiate_token_withdraw` on the L2 bridge contract.
   *
   * The `ExecuteOptions` portion of `options` is forwarded to
   * `starknetWallet.execute` unchanged; the bridge-internal `fastTransfer`
   * flag is consumed by protocol-specific overrides (e.g. CCTP fee tier)
   * and does not affect the Starknet transaction itself.
   */
  async initiateWithdraw(
    recipient: ExternalAddress,
    amount: Amount,
    options?: InitiateBridgeWithdrawOptions
  ): Promise<Tx> {
    const call = this.buildInitiateWithdrawCall(recipient.toString(), amount);
    return this.starknetWallet.execute([call], options);
  }

  async completeWithdraw(
    recipient: ExternalAddress,
    amount: Amount,
    _options?: CompleteBridgeWithdrawOptions
  ): Promise<ExternalTransactionResponse> {
    const details = await this.buildCompleteWithdrawCall(recipient, amount);
    const tx = await this.populateTransaction(details);
    const gasLimit = await this.estimateEthereumSafeGasLimitForTx(tx);
    const response = await this.execute({ ...tx, gasLimit });
    return { hash: response.hash };
  }

  async getCompleteWithdrawFeeEstimate(
    amount: Amount,
    recipient: ExternalAddress,
    _options?: CompleteBridgeWithdrawOptions
  ): Promise<EthereumCompleteWithdrawFeeEstimation> {
    try {
      const details = await this.buildCompleteWithdrawCall(recipient, amount);
      const tx = await this.populateTransaction(details);
      const [gasUnits, gasPrice] = await Promise.all([
        this.config.provider.estimateGas(tx),
        this.getEthereumGasPrice(),
      ]);
      return { l1Fee: this.ethAmount(gasUnits * gasPrice) };
    } catch {
      return {
        l1Fee: this.ethAmount(0n),
        l1FeeError: FeeErrorCause.GENERIC_L1_FEE_ERROR,
      };
    }
  }

  protected async populateTransaction(
    details: EthereumTransactionDetails
  ): Promise<ContractTransaction> {
    return await this.bridge
      .getFunction(details.method)
      .populateTransaction(...details.args, details.transaction);
  }

  protected buildInitiateWithdrawCall(recipient: string, amount: Amount): Call {
    return {
      contractAddress: this.bridgeToken.starknetBridge.toString(),
      entrypoint: "initiate_token_withdraw",
      calldata: CallData.compile({
        l1Token: this.bridgeToken.address.toString(),
        l1Recipient: recipient,
        amount: uint256.bnToUint256(amount.toBase()),
      }),
    };
  }

  protected async buildCompleteWithdrawCall(
    recipient: ExternalAddress,
    amount: Amount
  ): Promise<EthereumTransactionDetails> {
    return {
      method: "withdraw(address,uint256,address)",
      args: [
        this.bridgeToken.address.toString(),
        amount.toBase().toString(),
        recipient.toString(),
      ],
      transaction: {
        from: await this.config.signer.getAddress(),
      },
    };
  }
}
