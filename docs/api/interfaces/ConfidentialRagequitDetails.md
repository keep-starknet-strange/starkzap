[**starkzap**](../README.md)

***

[starkzap](../globals.md) / ConfidentialRagequitDetails

# Interface: ConfidentialRagequitDetails

Defined in: src/confidential/types.ts:49

Details for an emergency ragequit (full withdrawal).

## Properties

### to

> **to**: [`Address`](../type-aliases/Address.md)

Defined in: src/confidential/types.ts:51

The Starknet address to receive all funds.

***

### sender

> **sender**: [`Address`](../type-aliases/Address.md)

Defined in: src/confidential/types.ts:53

The Starknet sender address.

***

### feeTo?

> `optional` **feeTo**: `bigint`

Defined in: src/confidential/types.ts:55

Optional fee paid to sender (for relayed txs).
