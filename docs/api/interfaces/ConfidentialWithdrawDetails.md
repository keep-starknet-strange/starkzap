[**starkzap**](../README.md)

***

[starkzap](../globals.md) / ConfidentialWithdrawDetails

# Interface: ConfidentialWithdrawDetails

Defined in: src/confidential/types.ts:37

Details for withdrawing from a confidential account.

## Properties

### amount

> **amount**: `bigint`

Defined in: src/confidential/types.ts:39

Amount to withdraw (in tongo units).

***

### to

> **to**: [`Address`](../type-aliases/Address.md)

Defined in: src/confidential/types.ts:41

The Starknet address to receive the withdrawn ERC20 tokens.

***

### sender

> **sender**: [`Address`](../type-aliases/Address.md)

Defined in: src/confidential/types.ts:43

The Starknet sender address.

***

### feeTo?

> `optional` **feeTo**: `bigint`

Defined in: src/confidential/types.ts:45

Optional fee paid to sender (for relayed txs).
