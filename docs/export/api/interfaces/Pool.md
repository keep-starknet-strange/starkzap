[**starkzap**](../README.md)

***

[starkzap](../globals.md) / Pool

# Interface: Pool

Defined in: [src/types/pool.ts:10](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/pool.ts#L10)

Represents a staking pool for a validator.

Each validator can have multiple pools, one per supported token (e.g., STRK, BTC).

## Properties

### poolContract

> **poolContract**: [`Address`](../type-aliases/Address.md)

Defined in: [src/types/pool.ts:12](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/pool.ts#L12)

The pool contract address

***

### token

> **token**: [`Token`](Token.md)

Defined in: [src/types/pool.ts:14](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/pool.ts#L14)

The token that can be staked in this pool

***

### amount

> **amount**: [`Amount`](../classes/Amount.md)

Defined in: [src/types/pool.ts:16](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/pool.ts#L16)

The total amount staked in this pool by the validator
