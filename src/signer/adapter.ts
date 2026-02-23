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
import { BraavosPreset, BRAAVOS_IMPL_CLASS_HASH } from "@/account/presets";
import type { SignerInterface } from "@/signer/interface";

/**
 * Convert data availability mode to integer (0 = L1, 1 = L2).
 */
function intDAM(mode: string | EDAMode): 0 | 1 {
  if (mode === EDAMode.L2 || mode === "L2") return 1;
  return 0;
}

function assertV3Version(
  version: string,
  operation: "invoke" | "deploy_account" | "declare"
): void {
  let isV3 = false;
  try {
    isV3 = (BigInt(version) & 0xffn) === 0x3n;
  } catch {
    isV3 = false;
  }

  if (!isV3) {
    throw new Error(
      `SignerAdapter only supports V3 ${operation} transactions (received version ${version}).`
    );
  }
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
 * import { SignerAdapter, StarkSigner } from "@starkware-ecosystem/starkzap";
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
    assertV3Version(details.version, "invoke");
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
    assertV3Version(details.version, "deploy_account");
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

    const txSig = await this.signer.signRaw(msgHash as string);
    const txSigArray = Array.isArray(txSig) ? txSig : [txSig.r, txSig.s];
    if (!txSigArray[0] || !txSigArray[1]) {
      throw new Error("Invalid signature format from signer");
    }

    // Braavos Base: additional params are sent via the signature (15 elements).
    // See Braavos docs: "When using an ACCOUNT_DEPLOY transaction... the additional deployment parameters are sent via the signature."
    if (det.classHash === BraavosPreset.classHash) {
      const chainIdFelt =
        typeof det.chainId === "string"
          ? det.chainId
          : BigInt(det.chainId).toString(16).replace(/^/, "0x");
      const auxData: string[] = [
        BRAAVOS_IMPL_CLASS_HASH,
        "0x0",
        "0x0",
        "0x0",
        "0x0",
        "0x0",
        "0x0",
        "0x0",
        "0x0",
        "0x0",
        chainIdFelt,
      ];
      const auxHash = hash.computePoseidonHashOnElements(auxData);
      const auxSig = await this.signer.signRaw(auxHash);
      const auxSigArray = Array.isArray(auxSig) ? auxSig : [auxSig.r, auxSig.s];
      if (!auxSigArray[0] || !auxSigArray[1]) {
        throw new Error("Invalid aux signature format from signer");
      }
      return [
        String(txSigArray[0]),
        String(txSigArray[1]),
        BRAAVOS_IMPL_CLASS_HASH,
        "0x0",
        "0x0",
        "0x0",
        "0x0",
        "0x0",
        "0x0",
        "0x0",
        "0x0",
        "0x0",
        chainIdFelt,
        String(auxSigArray[0]),
        String(auxSigArray[1]),
      ];
    }

    return txSig;
  }

  async signDeclareTransaction(
    details: DeclareSignerDetails
  ): Promise<Signature> {
    assertV3Version(details.version, "declare");
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
