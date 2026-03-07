[**starkzap**](../README.md)

***

[starkzap](../globals.md) / ConfidentialConfig

# Interface: ConfidentialConfig

Defined in: src/confidential/types.ts:5

Configuration for creating a Confidential instance.

## Properties

### privateKey

> **privateKey**: `BigNumberish` \| `Uint8Array`\<`ArrayBufferLike`\>

Defined in: src/confidential/types.ts:7

The Tongo private key (separate from the Starknet wallet key).

***

### contractAddress

> **contractAddress**: [`Address`](../type-aliases/Address.md)

Defined in: src/confidential/types.ts:9

The Tongo contract address on Starknet.

***

### provider

> **provider**: [`RpcProvider`](RpcProvider.md)

Defined in: src/confidential/types.ts:11

An RPC provider for on-chain reads.
