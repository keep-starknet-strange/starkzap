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
  v3hash,
  EDAMode,
} from "starknet";
import type { SignerInterface } from "./interface.js";

/**
 * Convert data availability mode string to EDAMode.
 */
function toDAMode(mode: string): EDAMode {
  return mode === "L2" ? EDAMode.L2 : EDAMode.L1;
}

/**
 * Adapter that wraps any SignerInterface and implements StarknetSignerInterface.
 *
 * This allows custom signers to only implement the simple SignerInterface
 * (getPubKey + signRaw) while being fully compatible with starknet.js Account.
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
    const compiledCalldata = CallData.toCalldata(transactions);

    const msgHash = v3hash.calculateInvokeTransactionHash(
      det.walletAddress,
      det.version,
      compiledCalldata,
      det.chainId,
      det.nonce,
      det.accountDeploymentData || [],
      toDAMode(det.nonceDataAvailabilityMode as string),
      toDAMode(det.feeDataAvailabilityMode as string),
      det.resourceBounds,
      det.tip,
      det.paymasterData || []
    );

    return this.signer.signRaw(msgHash);
  }

  async signDeployAccountTransaction(
    details: DeployAccountSignerDetails
  ): Promise<Signature> {
    const det = details as V3DeployAccountSignerDetails;
    const compiledConstructorCalldata = CallData.compile(
      det.constructorCalldata
    );

    const msgHash = v3hash.calculateDeployAccountTransactionHash(
      det.contractAddress,
      det.classHash,
      compiledConstructorCalldata,
      det.addressSalt,
      det.version,
      det.chainId,
      det.nonce,
      toDAMode(det.nonceDataAvailabilityMode as string),
      toDAMode(det.feeDataAvailabilityMode as string),
      det.resourceBounds,
      BigInt(String(det.tip ?? 0)),
      det.paymasterData || []
    );

    return this.signer.signRaw(msgHash);
  }

  async signDeclareTransaction(
    details: DeclareSignerDetails
  ): Promise<Signature> {
    const det = details as V3DeclareSignerDetails;

    const msgHash = v3hash.calculateDeclareTransactionHash(
      det.classHash,
      det.compiledClassHash,
      det.senderAddress,
      det.version,
      det.chainId,
      det.nonce,
      det.accountDeploymentData || [],
      toDAMode(det.nonceDataAvailabilityMode as string),
      toDAMode(det.feeDataAvailabilityMode as string),
      det.resourceBounds,
      det.tip,
      det.paymasterData || []
    );

    return this.signer.signRaw(msgHash);
  }
}
