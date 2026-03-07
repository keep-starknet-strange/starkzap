[**starkzap**](../README.md)

***

[starkzap](../globals.md) / ConfidentialFundDetails

# Interface: ConfidentialFundDetails

Defined in: src/confidential/types.ts:15

Details for funding a confidential account.

## Properties

### amount

> **amount**: `bigint`

Defined in: src/confidential/types.ts:17

Amount to fund (in tongo units).

***

### sender

> **sender**: [`Address`](../type-aliases/Address.md)

Defined in: src/confidential/types.ts:19

The Starknet sender address (wallet address executing the tx).

***

### feeTo?

> `optional` **feeTo**: `bigint`

Defined in: src/confidential/types.ts:21

Optional fee paid to sender (for relayed txs).
