import {
  CallData,
  ec,
  encode,
  hash,
  shortString,
  stark,
  type Call,
} from "starknet";
import { SessionProtocolError } from "@/cartridge/ts/errors";
import type { PolicyMerkleProof } from "@/cartridge/ts/merkle";
import type { SessionRegistration } from "@/cartridge/ts/session_api";
import type { TsSessionExecutionDetails } from "@/cartridge/ts/session_account";
import {
  normalizeContractAddress,
  normalizeFelt,
  selectorFromEntrypoint,
} from "@/cartridge/ts/shared";

const ZERO_FELT = "0x0";
const ONE_FELT = "0x1";
const TWO_FELT = "0x2";

const STARKNET_MESSAGE = shortFelt("StarkNet Message");
const OUTSIDE_EXECUTION_CALLER_ANY = shortFelt("ANY_CALLER");
const SESSION_TOKEN_MAGIC = shortFelt("session-token");
const AUTHORIZATION_BY_REGISTERED = shortFelt("authorization-by-registered");
// The Cartridge session token format requires two signatures: one from the
// ephemeral session key (produced below with `sessionPrivateKey`) and one
// from the guardian key.
//
// In this client-side flow, the guardian is Cartridge's own paymaster
// infrastructure. When `cartridge_addExecuteOutsideTransaction` receives the
// request, Cartridge's server discards the client-provided guardian signature
// and replaces it with one produced by their actual guardian key before
// submitting the transaction to the network.
//
// This constant is therefore a well-known placeholder, not a secret. Its value
// matches the deterministic sentinel used in controller.c for the same purpose.
// Changing it would break parity with the Cartridge protocol — do not treat it
// as a private key that needs rotation or secrecy.
const GUARDIAN_KEY_PLACEHOLDER = shortFelt("CARTRIDGE_GUARDIAN");

// SNIP-12 type hashes for the Cartridge session protocol.
// Each is the Starknet selector of the SNIP-12 struct encoding string.
// Changing these breaks protocol compatibility.
const STARKNET_DOMAIN_TYPE_HASH = selectorFelt(
  '"StarknetDomain"("name":"shortstring","version":"shortstring","chainId":"shortstring","revision":"shortstring")'
);
const CALL_TYPE_HASH = selectorFelt(
  '"Call"("To":"ContractAddress","Selector":"selector","Calldata":"felt*")'
);
const OUTSIDE_EXECUTION_TYPE_HASH = selectorFelt(
  '"OutsideExecution"("Caller":"ContractAddress","Nonce":"(felt,u128)","Execute After":"u128","Execute Before":"u128","Calls":"Call*")"Call"("To":"ContractAddress","Selector":"selector","Calldata":"felt*")'
);
const SESSION_TYPE_HASH = selectorFelt(
  '"Session"("Expires At":"timestamp","Allowed Methods":"merkletree","Metadata":"string","Session Key":"felt")'
);

const OUTSIDE_EXECUTION_DOMAIN_NAME = shortFelt("Account.execute_from_outside");
const SESSION_DOMAIN_NAME = shortFelt("SessionAccount.session");
const SESSION_DOMAIN_VERSION = shortFelt("1");

interface StarknetSignerSignature {
  pubkey: string;
  r: string;
  s: string;
}

export interface RpcOutsideExecutionCall {
  to: string;
  selector: string;
  calldata: string[];
}

export interface RpcOutsideExecutionV3 {
  caller: string;
  nonce: [string, string];
  execute_after: string;
  execute_before: string;
  calls: RpcOutsideExecutionCall[];
}

export interface SignedOutsideExecutionV3 {
  outsideExecution: RpcOutsideExecutionV3;
  signature: string[];
}

interface NormalizedExecutionCall {
  contractAddress: string;
  selector: string;
  calldata: string[];
}

interface NormalizedExecutionCallTarget {
  contractAddress: string;
  entrypoint: string;
  selector: string;
}

interface SessionStruct {
  expiresAt: string;
  allowedPoliciesRoot: string;
  metadataHash: string;
  sessionKeyGuid: string;
  guardianKeyGuid: string;
}

export interface BuildSignedOutsideExecutionV3Args {
  calls: Call[];
  details?: TsSessionExecutionDetails;
  chainId: string;
  session: SessionRegistration;
  sessionPrivateKey: string;
  policyRoot: string;
  sessionKeyGuid: string;
  policyProofIndex: ReadonlyMap<string, string[]>;
  nowSeconds?: number;
}

function shortFelt(value: string): string {
  try {
    return normalizeFelt(shortString.encodeShortString(value));
  } catch (error) {
    throw new SessionProtocolError(
      `Failed to encode short string as felt: ${value}`,
      error
    );
  }
}

function selectorFelt(value: string): string {
  return normalizeFelt(hash.getSelectorFromName(value));
}

function toUintBigInt(
  value: string | number | bigint,
  fieldName: string
): bigint {
  try {
    if (typeof value === "bigint") {
      if (value < 0n) {
        throw new Error("value cannot be negative");
      }
      return value;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
        throw new Error("value must be a finite non-negative integer");
      }
      return BigInt(value);
    }

    const trimmed = value.trim();
    if (!trimmed || trimmed.startsWith("-")) {
      throw new Error("value cannot be empty or negative");
    }
    return BigInt(trimmed);
  } catch (error) {
    throw new SessionProtocolError(
      `Invalid unsigned integer for ${fieldName}`,
      error
    );
  }
}

function feltFromValue(
  value: string | number | bigint,
  fieldName: string
): string {
  const parsed = toUintBigInt(value, fieldName);
  return normalizeFelt(parsed);
}

function normalizeCallEntrypoint(entrypoint: string): string {
  const trimmed = entrypoint.trim();
  if (!trimmed) {
    throw new SessionProtocolError("Call entrypoint cannot be empty.");
  }
  return selectorFromEntrypoint(trimmed);
}

function normalizeChainId(chainId: string): string {
  const trimmed = chainId.trim();
  if (!trimmed) {
    throw new SessionProtocolError("Chain ID cannot be empty.");
  }
  if (/^0x[0-9a-f]+$/i.test(trimmed)) {
    return normalizeFelt(trimmed);
  }
  return shortFelt(trimmed);
}

function rawContractAddressFromCall(call: Call): string {
  return String(
    (call as unknown as { contractAddress?: unknown }).contractAddress ?? ""
  );
}

function rawEntrypointFromCall(call: Call): string {
  return String((call as unknown as { entrypoint?: unknown }).entrypoint ?? "");
}

function normalizeExecutionCallTarget(
  call: Call
): NormalizedExecutionCallTarget {
  const entrypoint = rawEntrypointFromCall(call).trim();
  return {
    contractAddress: normalizeContractAddress(
      rawContractAddressFromCall(call),
      "Outside execution call"
    ),
    entrypoint,
    selector: normalizeCallEntrypoint(entrypoint),
  };
}

function normalizeExecutionCall(call: Call): NormalizedExecutionCall {
  const target = normalizeExecutionCallTarget(call);
  const calldata = CallData.toHex(call.calldata ?? []).map((felt) =>
    normalizeFelt(felt)
  );

  return {
    contractAddress: target.contractAddress,
    selector: target.selector,
    calldata,
  };
}

function normalizeExecutionCalls(
  calls: readonly Call[]
): NormalizedExecutionCall[] {
  if (calls.length === 0) {
    throw new SessionProtocolError(
      "At least one call is required for executeFromOutside V3."
    );
  }

  return calls.map(normalizeExecutionCall);
}

export function createPolicyProofIndex(
  proofs: readonly PolicyMerkleProof[]
): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const proof of proofs) {
    const key = policyKey(proof.contractAddress, proof.selector);
    if (!index.has(key)) {
      index.set(
        key,
        proof.proof.map((value) => normalizeFelt(value))
      );
    }
  }
  return index;
}

function policyKey(contractAddress: string, selector: string): string {
  return `${normalizeContractAddress(contractAddress, "Policy proof key")}:${normalizeFelt(selector)}`;
}

export function listCallsMissingPolicyProofs(
  calls: readonly Call[],
  policyProofIndex: ReadonlyMap<string, string[]>
): string[] {
  return calls.flatMap((call) => {
    const target = normalizeExecutionCallTarget(call);
    const key = policyKey(target.contractAddress, target.selector);
    return policyProofIndex.has(key)
      ? []
      : [`${target.contractAddress}#${target.entrypoint}`];
  });
}

function resolveCallProofs(
  calls: readonly NormalizedExecutionCall[],
  policyProofIndex: ReadonlyMap<string, string[]>
): string[][] {
  return calls.map((call) => {
    const key = policyKey(call.contractAddress, call.selector);
    const proof = policyProofIndex.get(key);
    if (!proof) {
      throw new SessionProtocolError(
        `Call is not authorized by session policies: ${call.contractAddress}#${call.selector}`
      );
    }
    return proof;
  });
}

function hashCallStruct(call: RpcOutsideExecutionCall): string {
  const calldataHash = normalizeFelt(
    hash.computePoseidonHashOnElements(call.calldata)
  );
  return normalizeFelt(
    hash.computePoseidonHashOnElements([
      CALL_TYPE_HASH,
      call.to,
      call.selector,
      calldataHash,
    ])
  );
}

function hashStarknetDomain(
  name: string,
  version: string,
  chainId: string,
  revision: string
): string {
  return normalizeFelt(
    hash.computePoseidonHashOnElements([
      STARKNET_DOMAIN_TYPE_HASH,
      name,
      version,
      chainId,
      revision,
    ])
  );
}

function hashMessageRev1(
  domainHash: string,
  contractAddress: string,
  structHash: string
): string {
  return normalizeFelt(
    hash.computePoseidonHashOnElements([
      STARKNET_MESSAGE,
      domainHash,
      contractAddress,
      structHash,
    ])
  );
}

function hashOutsideExecutionMessage(
  outsideExecution: RpcOutsideExecutionV3,
  chainId: string,
  contractAddress: string
): string {
  const callHashes = outsideExecution.calls.map(hashCallStruct);
  const callHashesHash = normalizeFelt(
    hash.computePoseidonHashOnElements(callHashes)
  );

  const outsideExecutionStructHash = normalizeFelt(
    hash.computePoseidonHashOnElements([
      OUTSIDE_EXECUTION_TYPE_HASH,
      outsideExecution.caller,
      outsideExecution.nonce[0],
      outsideExecution.nonce[1],
      outsideExecution.execute_after,
      outsideExecution.execute_before,
      callHashesHash,
    ])
  );

  const domainHash = hashStarknetDomain(
    OUTSIDE_EXECUTION_DOMAIN_NAME,
    TWO_FELT,
    chainId,
    TWO_FELT
  );

  return hashMessageRev1(
    domainHash,
    contractAddress,
    outsideExecutionStructHash
  );
}

function hashSessionStruct(session: SessionStruct): string {
  return normalizeFelt(
    hash.computePoseidonHashOnElements([
      SESSION_TYPE_HASH,
      session.expiresAt,
      session.allowedPoliciesRoot,
      session.metadataHash,
      session.sessionKeyGuid,
      session.guardianKeyGuid,
    ])
  );
}

function hashSessionMessage(
  session: SessionStruct,
  chainId: string,
  contractAddress: string
): string {
  const domainHash = hashStarknetDomain(
    SESSION_DOMAIN_NAME,
    SESSION_DOMAIN_VERSION,
    chainId,
    ONE_FELT
  );
  return hashMessageRev1(
    domainHash,
    contractAddress,
    hashSessionStruct(session)
  );
}

function signStarknet(
  messageHash: string,
  privateKey: string
): StarknetSignerSignature {
  try {
    const normalizedPrivateKey = encode.addHexPrefix(privateKey.trim());
    const signature = ec.starkCurve.sign(messageHash, normalizedPrivateKey);
    return {
      pubkey: normalizeFelt(ec.starkCurve.getStarkKey(normalizedPrivateKey)),
      r: normalizeFelt(signature.r),
      s: normalizeFelt(signature.s),
    };
  } catch (error) {
    throw new SessionProtocolError(
      "Failed to sign outside execution payload.",
      error
    );
  }
}

function serializeArray(values: readonly string[]): string[] {
  return [
    feltFromValue(values.length, "array length"),
    ...values.map((value) => normalizeFelt(value)),
  ];
}

function serializeArrayOfArrays(values: readonly string[][]): string[] {
  const out: string[] = [feltFromValue(values.length, "nested array length")];
  for (const value of values) {
    out.push(...serializeArray(value));
  }
  return out;
}

function serializeSessionStruct(session: SessionStruct): string[] {
  return [
    session.expiresAt,
    session.allowedPoliciesRoot,
    session.metadataHash,
    session.sessionKeyGuid,
    session.guardianKeyGuid,
  ];
}

function serializeStarknetSignerSignature(
  signature: StarknetSignerSignature
): string[] {
  // SignerSignature variant 0 = Starknet, followed by (pubkey, r, s).
  return [ZERO_FELT, signature.pubkey, signature.r, signature.s];
}

function serializeSessionToken(args: {
  session: SessionStruct;
  sessionAuthorization: string[];
  sessionSignature: StarknetSignerSignature;
  guardianSignature: StarknetSignerSignature;
  proofs: string[][];
}): string[] {
  return [
    ...serializeSessionStruct(args.session),
    ONE_FELT, // Variant discriminator for "registered session" token format.

    ...serializeArray(args.sessionAuthorization),
    ...serializeStarknetSignerSignature(args.sessionSignature),
    ...serializeStarknetSignerSignature(args.guardianSignature),
    ...serializeArrayOfArrays(args.proofs),
  ];
}

function normalizeSessionStruct(
  session: SessionRegistration,
  policyRoot: string,
  fallbackSessionKeyGuid: string
): SessionStruct {
  return {
    expiresAt: feltFromValue(session.expiresAt, "session.expiresAt"),
    allowedPoliciesRoot: feltFromValue(policyRoot, "policyRoot"),
    metadataHash: feltFromValue(
      session.metadataHash ?? ZERO_FELT,
      "session.metadataHash"
    ),
    sessionKeyGuid: feltFromValue(
      session.sessionKeyGuid || fallbackSessionKeyGuid,
      "session.sessionKeyGuid"
    ),
    guardianKeyGuid: feltFromValue(
      session.guardianKeyGuid || ZERO_FELT,
      "session.guardianKeyGuid"
    ),
  };
}

export function buildSignedOutsideExecutionV3({
  calls,
  details,
  chainId,
  session,
  sessionPrivateKey,
  policyRoot,
  sessionKeyGuid,
  policyProofIndex,
  nowSeconds,
}: BuildSignedOutsideExecutionV3Args): SignedOutsideExecutionV3 {
  const normalizedCalls = normalizeExecutionCalls(calls);
  const proofs = resolveCallProofs(normalizedCalls, policyProofIndex);

  const now = toUintBigInt(
    nowSeconds ?? Math.floor(Date.now() / 1000),
    "nowSeconds"
  );
  const executeAfter = toUintBigInt(
    details?.timeBounds?.executeAfter ?? 0,
    "timeBounds.executeAfter"
  );
  const executeBefore = toUintBigInt(
    details?.timeBounds?.executeBefore ?? now + 600n,
    "timeBounds.executeBefore"
  );
  if (executeBefore <= executeAfter) {
    throw new SessionProtocolError(
      "Outside execution window is invalid: execute_before must be greater than execute_after."
    );
  }

  const outsideExecution: RpcOutsideExecutionV3 = {
    caller: OUTSIDE_EXECUTION_CALLER_ANY,
    // SNIP-9 v2 nonce: (random_value, 1). High part = 1 signals non-sequential (random) nonce mode.
    nonce: [normalizeFelt(stark.randomAddress()), ONE_FELT],
    execute_after: feltFromValue(
      executeAfter,
      "outsideExecution.execute_after"
    ),
    execute_before: feltFromValue(
      executeBefore,
      "outsideExecution.execute_before"
    ),
    calls: normalizedCalls.map((call) => ({
      to: call.contractAddress,
      selector: call.selector,
      calldata: call.calldata,
    })),
  };

  const sessionAddress = normalizeContractAddress(
    session.address,
    "Session address"
  );
  const feltChainId = normalizeChainId(chainId);

  const txHash = hashOutsideExecutionMessage(
    outsideExecution,
    feltChainId,
    sessionAddress
  );
  const sessionStruct = normalizeSessionStruct(
    session,
    policyRoot,
    sessionKeyGuid
  );
  const sessionHash = hashSessionMessage(
    sessionStruct,
    feltChainId,
    sessionAddress
  );
  const sessionTokenHash = normalizeFelt(
    hash.computePoseidonHash(txHash, sessionHash)
  );

  const sessionSignature = signStarknet(sessionTokenHash, sessionPrivateKey);
  const guardianSignature = signStarknet(
    sessionTokenHash,
    GUARDIAN_KEY_PLACEHOLDER
  );

  const sessionAuthorization = [
    AUTHORIZATION_BY_REGISTERED,
    feltFromValue(session.ownerGuid, "session.ownerGuid"),
  ];

  const signature = [
    SESSION_TOKEN_MAGIC,
    ...serializeSessionToken({
      session: sessionStruct,
      sessionAuthorization,
      sessionSignature,
      guardianSignature,
      proofs,
    }),
  ];

  return {
    outsideExecution,
    signature,
  };
}
