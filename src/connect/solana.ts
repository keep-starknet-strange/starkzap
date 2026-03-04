import type {
  SolanaConnectedWallet,
  SolanaTransactionInput,
  SolanaTransactionRequest,
} from "@/connect/types";
import {
  assertNonEmptyString,
  bytesToHex,
  describeValue,
  isRecord,
  messageToBytes,
  normalizeChainId,
  readStringResult,
} from "@/connect/utils";
import { ExternalChain } from "@/types";

interface SolanaProvider {
  signMessage(message: Uint8Array): Promise<unknown>;
  signAndSendTransaction(
    transaction: object,
    options?: Record<string, unknown>
  ): Promise<unknown>;
}

function assertSolanaProvider(provider: unknown): SolanaProvider {
  if (
    typeof provider === "object" &&
    provider !== null &&
    "signMessage" in provider &&
    typeof provider.signMessage === "function" &&
    "signAndSendTransaction" in provider &&
    typeof provider.signAndSendTransaction === "function"
  ) {
    return provider as SolanaProvider;
  }

  throw new Error(
    `Solana provider must implement signMessage() and signAndSendTransaction(). Received ${describeValue(provider)}.`
  );
}

function isSolanaRequest(value: object): value is SolanaTransactionRequest {
  return "transaction" in value;
}

function readSolanaSignature(value: unknown): string {
  if (value instanceof Uint8Array) {
    return bytesToHex(value);
  }

  if (isRecord(value) && value.signature instanceof Uint8Array) {
    return bytesToHex(value.signature);
  }

  return readStringResult(value, "solana method", ["signature", "txid"]);
}

export function connectSolanaWallet(
  provider: unknown,
  address: string,
  chainId: unknown
): SolanaConnectedWallet {
  const normalizedAddress = assertNonEmptyString(address, "address");
  const normalizedChainId = normalizeChainId(ExternalChain.SOLANA, chainId);
  const solanaProvider = assertSolanaProvider(provider);

  return {
    chain: ExternalChain.SOLANA,
    address: normalizedAddress,
    chainId: normalizedChainId,
    async signMessage(message: string | Uint8Array): Promise<string> {
      const result = await solanaProvider.signMessage(messageToBytes(message));
      return readSolanaSignature(result);
    },
    async sendTransaction(tx: SolanaTransactionInput): Promise<string> {
      if (!isRecord(tx)) {
        throw new Error("Solana transaction must be an object.");
      }

      let transaction: object = tx;
      let options: Record<string, unknown> | undefined;

      if (isSolanaRequest(tx)) {
        transaction = tx.transaction;
        options = tx.options;
      }

      if (!isRecord(transaction)) {
        throw new Error("Solana transaction payload must be an object.");
      }

      const result = await solanaProvider.signAndSendTransaction(
        transaction,
        options
      );

      return readStringResult(result, "signAndSendTransaction", [
        "signature",
        "txid",
      ]);
    },
    getRawProvider(): unknown {
      return solanaProvider;
    },
  };
}
