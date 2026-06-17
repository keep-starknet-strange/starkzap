import {
  type Call,
  Contract,
  hash,
  num,
  type RpcProvider,
  type TypedContractV2,
  uint256,
} from "starknet";
import { ABI as PAYCREST_GATEWAY_ABI } from "@/abi/paycrest";
import { fromAddress, type Address } from "@/types";
import type { PaycrestOrderInfo } from "@/paycrest/types";

/**
 * Cairo selector for `OrderCreated`. Computed at module load — matches
 * `keys[0]` of the event emitted by `create_order`.
 *
 * `keys[0] = selector("OrderCreated")`,
 * `keys[1] = sender`, `keys[2] = token`,
 * `keys[3..4] = amount.low/high (indexed u256)`,
 * `data[0..1] = protocol_fee.low/high`,
 * `data[2] = order_id (felt252)`,
 * `data[3] = rate (u128)`,
 * `data[4..] = message_hash (ByteArray serialization)`
 */
export const ORDER_CREATED_EVENT_SELECTOR = num.toHex(
  hash.starknetKeccak("OrderCreated")
);

const ZERO_ADDRESS_FELT = "0x0";

export interface PopulateCreateOrderArgs {
  token: Address;
  /** Token amount in base units (e.g. `Amount.toBase()`). */
  amount: bigint;
  /** Rate as `u128`, scaled per the Paycrest convention (see notes in paycrest.ts). */
  rate: bigint;
  /** Optional sender-fee recipient. Defaults to the zero address. */
  senderFeeRecipient?: Address;
  /** Optional sender fee in token base units. Defaults to `0n`. */
  senderFee?: bigint;
  /** Refund address — typically the wallet sending the order. */
  refundAddress: Address;
  /** Base64-encoded RSA PKCS1 v1.5 ciphertext of the recipient JSON. */
  messageHash: string;
}

/**
 * Wrapper around the Cairo Gateway contract. Mirrors the `Erc20` class:
 * an instance per gateway address with `populate*` builders and read
 * helpers. The off-ramp gateway path uses `populateCreateOrder` to
 * produce a `Call` for batching alongside the ERC20 approve.
 */
export class PaycrestGateway {
  readonly address: Address;
  private readonly contract: TypedContractV2<typeof PAYCREST_GATEWAY_ABI>;

  constructor(address: Address, provider: RpcProvider) {
    this.address = address;
    this.contract = new Contract({
      abi: PAYCREST_GATEWAY_ABI,
      address,
      providerOrAccount: provider,
    }).typedv2(PAYCREST_GATEWAY_ABI);
  }

  /**
   * Build a `create_order` Call without executing. Compose with an
   * ERC20 approve to the gateway (for `amount + senderFee`) and submit
   * atomically via `wallet.execute([approve, createOrder])`.
   */
  populateCreateOrder(args: PopulateCreateOrderArgs): Call {
    const senderFeeRecipient =
      args.senderFeeRecipient ?? (ZERO_ADDRESS_FELT as Address);
    const senderFee = args.senderFee ?? 0n;
    return this.contract.populateTransaction.create_order(
      args.token,
      uint256.bnToUint256(args.amount),
      args.rate,
      senderFeeRecipient,
      uint256.bnToUint256(senderFee),
      args.refundAddress,
      args.messageHash
    );
  }

  /** Whether the gateway accepts orders for `token`. */
  async isTokenSupported(token: Address): Promise<boolean> {
    return this.contract.is_token_supported(token);
  }

  /** Read the on-chain order struct by id (felt252 hex string). */
  async getOrderInfo(orderId: string): Promise<PaycrestOrderInfo> {
    const raw = (await this.contract.get_order_info(orderId)) as unknown as {
      sender: bigint | string;
      token: bigint | string;
      sender_fee_recipient: bigint | string;
      sender_fee:
        | bigint
        | string
        | { low: bigint | string; high: bigint | string };
      protocol_fee:
        | bigint
        | string
        | { low: bigint | string; high: bigint | string };
      is_fulfilled: boolean;
      is_refunded: boolean;
      refund_address: bigint | string;
      current_bps: bigint | string;
      amount: bigint | string | { low: bigint | string; high: bigint | string };
    };
    return {
      sender: fromAddress(raw.sender),
      token: fromAddress(raw.token),
      senderFeeRecipient: fromAddress(raw.sender_fee_recipient),
      senderFee: toBigInt(raw.sender_fee),
      protocolFee: toBigInt(raw.protocol_fee),
      isFulfilled: raw.is_fulfilled,
      isRefunded: raw.is_refunded,
      refundAddress: fromAddress(raw.refund_address),
      currentBps: toBigInt(raw.current_bps),
      amount: toBigInt(raw.amount),
    };
  }
}

function toBigInt(
  value: bigint | string | { low: bigint | string; high: bigint | string }
): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "string") return BigInt(value);
  // u256 returned by the typed contract is `{low, high}` already as
  // bigint/string — fold it back into a single bigint.
  return uint256.uint256ToBN({
    low: BigInt(value.low),
    high: BigInt(value.high),
  });
}

/**
 * Find the `OrderCreated` event for a given gateway in the receipt's
 * event list and return the order id (felt252 hex string). Returns
 * `null` if no matching event is present.
 *
 * Receipts from `account.execute()` typically include events under
 * `events: { from_address, keys, data }[]`. We match by both
 * `from_address` (the gateway) and `keys[0]` (the event selector).
 */
export function extractOrderIdFromReceipt(
  receipt: {
    events?: ReadonlyArray<{
      from_address?: string;
      keys?: string[];
      data?: string[];
    }>;
  },
  gatewayAddress: Address
): string | null {
  const events = receipt.events;
  if (!events || events.length === 0) return null;
  const gatewayHex = num.toHex(num.toBigInt(gatewayAddress));
  const targetKey = num.toHex(num.toBigInt(ORDER_CREATED_EVENT_SELECTOR));
  for (const e of events) {
    const fromHex = e.from_address
      ? num.toHex(num.toBigInt(e.from_address))
      : "";
    if (fromHex !== gatewayHex) continue;
    const keys = e.keys ?? [];
    if (keys.length === 0) continue;
    const k0 = num.toHex(num.toBigInt(keys[0]!));
    if (k0 !== targetKey) continue;
    // data layout: protocol_fee (2 felts), order_id (1 felt), rate (1 felt), message_hash (...)
    const data = e.data ?? [];
    if (data.length < 3) continue;
    return num.toHex(num.toBigInt(data[2]!));
  }
  return null;
}
