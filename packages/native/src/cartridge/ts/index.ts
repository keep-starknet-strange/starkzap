import { registerCartridgeNativeAdapter } from "@/cartridge/registry";
import {
  createCartridgeTsAdapter,
  type CreateCartridgeTsAdapterOptions,
} from "@/cartridge/ts/adapter";

export { createCartridgeTsAdapter, type CreateCartridgeTsAdapterOptions };
export { deriveSessionSignerGuid } from "@/cartridge/ts/guid";
export {
  computePolicyMerkle,
  type PolicyMerkleResult,
} from "@/cartridge/ts/merkle";
export {
  canonicalizeSessionPolicies,
  policiesToSessionUrlShape,
  type CanonicalSessionPolicy,
} from "@/cartridge/ts/policy";
export type {
  NormalizedCartridgeContractPolicy,
  NormalizedCartridgePolicies,
  NormalizedCartridgeSessionPolicies,
} from "@/cartridge/types";
export {
  buildCartridgeSessionUrl,
  extractEncodedSessionFromUrl,
  parseSessionFromEncodedRedirect,
  waitForSessionSubscription,
  type SessionRegistration,
  type WaitForSessionSubscriptionOptions,
} from "@/cartridge/ts/session_api";
export {
  extractTransactionHash,
  TsSessionAccount,
  type TsSessionExecutionContext,
  type TsSessionExecutionDetails,
  type TsExecute,
  type TsExecuteFromOutside,
} from "@/cartridge/ts/session_account";
export {
  SessionProtocolError,
  SessionRejectedError,
  SessionTimeoutError,
} from "@/cartridge/ts/errors";

export function registerCartridgeTsAdapter(
  options: CreateCartridgeTsAdapterOptions = {}
) {
  const adapter = createCartridgeTsAdapter(options);
  registerCartridgeNativeAdapter(adapter);
  return adapter;
}
