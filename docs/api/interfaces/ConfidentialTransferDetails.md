[**starkzap**](../README.md)

***

[starkzap](../globals.md) / ConfidentialTransferDetails

# Interface: ConfidentialTransferDetails

Defined in: src/confidential/types.ts:25

Details for a confidential transfer.

## Properties

### amount

> **amount**: `bigint`

Defined in: src/confidential/types.ts:27

Amount to transfer (in tongo units).

***

### to

> **to**: `object`

Defined in: src/confidential/types.ts:29

Recipient's Tongo public key (as {x, y} coordinates).

#### x

> **x**: `BigNumberish`

#### y

> **y**: `BigNumberish`

***

### sender

> **sender**: [`Address`](../type-aliases/Address.md)

Defined in: src/confidential/types.ts:31

The Starknet sender address.

***

### feeTo?

> `optional` **feeTo**: `bigint`

Defined in: src/confidential/types.ts:33

Optional fee paid to sender (for relayed txs).
