import type {
  EvmConnectedWallet,
  EvmTransactionRequest,
} from "@/connect/types";
import {
  assertNonEmptyString,
  assertObject,
  bytesToHex,
  describeValue,
  messageToBytes,
  normalizeChainId,
  readStringResult,
} from "@/connect/utils";
import { ExternalChain } from "@/types";

interface Eip1193Provider {
  request(args: {
    method: string;
    params?: readonly unknown[] | Record<string, unknown>;
  }): Promise<unknown>;
}

function assertEip1193Provider(provider: unknown): Eip1193Provider {
  if (
    typeof provider === "object" &&
    provider !== null &&
    "request" in provider &&
    typeof provider.request === "function"
  ) {
    return provider as Eip1193Provider;
  }

  throw new Error(
    `EVM provider must implement EIP-1193 request(). Received ${describeValue(provider)}.`
  );
}

export function connectEvmWallet(
  provider: unknown,
  address: string,
  chainId: unknown
): EvmConnectedWallet {
  const normalizedAddress = assertNonEmptyString(address, "address");
  const normalizedChainId = normalizeChainId(ExternalChain.ETHEREUM, chainId);
  const evmProvider = assertEip1193Provider(provider);

  return {
    chain: ExternalChain.ETHEREUM,
    address: normalizedAddress,
    chainId: normalizedChainId,
    async signMessage(message: string | Uint8Array): Promise<string> {
      const payload = bytesToHex(messageToBytes(message));
      const result = await evmProvider.request({
        method: "personal_sign",
        params: [payload, normalizedAddress],
      });
      return readStringResult(result, "personal_sign");
    },
    async sendTransaction(tx: EvmTransactionRequest): Promise<string> {
      const transaction = assertObject(tx, "EVM transaction");
      const result = await evmProvider.request({
        method: "eth_sendTransaction",
        params: [transaction],
      });
      return readStringResult(result, "eth_sendTransaction");
    },
    getRawProvider(): unknown {
      return evmProvider;
    },
  };
}
