import {
  type Call,
  type InvocationsSignerDetails,
  type DeployAccountSignerDetails,
  type DeclareSignerDetails,
  type Signature,
  type SignerInterface as StarknetSignerInterface,
  type TypedData,
  type V3InvocationsSignerDetails,
  type V3DeployAccountSignerDetails,
  type V3DeclareSignerDetails,
  typedData as typedDataUtils,
  CallData,
  hash,
  transaction,
  EDAMode,
} from "starknet";
import type { SignerInterface } from "@/signer/interface";

/**
 * Convert data availability mode to integer (0 = L1, 1 = L2).
 */
function intDAM(mode: string | EDAMode): 0 | 1 {
  if (mode === EDAMode.L2 || mode === "L2") return 1;
  return 0;
}

/**
 * Adapter that bridges the SDK's minimal {@link SignerInterface} to the
 * full `starknet.js` `SignerInterface`.
 *
 * Custom signers only need to implement two methods (`getPubKey` + `signRaw`).
 * This adapter handles the complex transaction hash computations required by
 * `starknet.js` Account for invoke, deploy-account, and declare transactions.
 *
 * @remarks
 * You don't normally create this directly — the SDK creates it internally
 * when you call `sdk.connectWallet()`.
 *
 * @example
 * ```ts
 * import { SignerAdapter, StarkSigner } from "starkzap";
 * import { Account, RpcProvider } from "starknet";
 *
 * const adapter = new SignerAdapter(new StarkSigner(privateKey));
 * const account = new Account({ provider, address, signer: adapter });
 * ```
 */
export class SignerAdapter implements StarknetSignerInterface {
  constructor(private readonly signer: SignerInterface) {}

  async getPubKey(): Promise<string> {
    return this.signer.getPubKey();
  }

  async signMessage(
    typedData: TypedData,
    accountAddress: string
  ): Promise<Signature> {
    const msgHash = typedDataUtils.getMessageHash(typedData, accountAddress);
    return this.signer.signRaw(msgHash);
  }

  async signTransaction(
    transactions: Call[],
    details: InvocationsSignerDetails
  ): Promise<Signature> {
    const det = details as V3InvocationsSignerDetails;
    // Use getExecuteCalldata to properly format multicall for the account's cairo version
    const compiledCalldata = transaction.getExecuteCalldata(
      transactions,
      det.cairoVersion
    );

    const msgHash = hash.calculateInvokeTransactionHash({
      senderAddress: det.walletAddress,
      version: det.version,
      compiledCalldata,
      chainId: det.chainId,
      nonce: det.nonce,
      accountDeploymentData: det.accountDeploymentData || [],
      nonceDataAvailabilityMode: intDAM(det.nonceDataAvailabilityMode),
      feeDataAvailabilityMode: intDAM(det.feeDataAvailabilityMode),
      resourceBounds: det.resourceBounds,
      tip: det.tip ?? 0,
      paymasterData: det.paymasterData || [],
    });

    return this.signer.signRaw(msgHash as string);
  }

  async signDeployAccountTransaction(
    details: DeployAccountSignerDetails
  ): Promise<Signature> {
    const det = details as V3DeployAccountSignerDetails;
    const compiledConstructorCalldata = CallData.compile(
      det.constructorCalldata
    );

    const msgHash = hash.calculateDeployAccountTransactionHash({
      contractAddress: det.contractAddress,
      classHash: det.classHash,
      compiledConstructorCalldata,
      salt: det.addressSalt,
      version: det.version,
      chainId: det.chainId,
      nonce: det.nonce,
      nonceDataAvailabilityMode: intDAM(det.nonceDataAvailabilityMode),
      feeDataAvailabilityMode: intDAM(det.feeDataAvailabilityMode),
      resourceBounds: det.resourceBounds,
      tip: det.tip ?? 0,
      paymasterData: det.paymasterData || [],
    });

    return this.signer.signRaw(msgHash as string);
  }

  async signDeclareTransaction(
    details: DeclareSignerDetails
  ): Promise<Signature> {
    const det = details as V3DeclareSignerDetails;

    const msgHash = hash.calculateDeclareTransactionHash({
      classHash: det.classHash,
      compiledClassHash: det.compiledClassHash,
      senderAddress: det.senderAddress,
      version: det.version,
      chainId: det.chainId,
      nonce: det.nonce,
      accountDeploymentData: det.accountDeploymentData || [],
      nonceDataAvailabilityMode: intDAM(det.nonceDataAvailabilityMode),
      feeDataAvailabilityMode: intDAM(det.feeDataAvailabilityMode),
      resourceBounds: det.resourceBounds,
      tip: det.tip ?? 0,
      paymasterData: det.paymasterData || [],
    });

    return this.signer.signRaw(msgHash as string);
  }
}
