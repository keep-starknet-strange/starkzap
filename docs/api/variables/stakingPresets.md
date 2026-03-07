[**starkzap**](../README.md)

***

[starkzap](../globals.md) / stakingPresets

# Variable: stakingPresets

> `const` **stakingPresets**: `object`

Defined in: [src/staking/presets.ts:9](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/staking/presets.ts#L9)

Core staking contract presets per supported chain.

These defaults are used by `StarkZap` when `staking.contract`
is not explicitly provided in the SDK config.

## Type Declaration

### SN\_MAIN

> `readonly` **SN\_MAIN**: `object`

#### SN\_MAIN.contract

> `readonly` **contract**: [`Address`](../type-aliases/Address.md)

### SN\_SEPOLIA

> `readonly` **SN\_SEPOLIA**: `object`

#### SN\_SEPOLIA.contract

> `readonly` **contract**: [`Address`](../type-aliases/Address.md)
