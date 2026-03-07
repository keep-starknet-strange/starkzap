[**starkzap**](../README.md)

***

[starkzap](../globals.md) / StakingConfig

# Interface: StakingConfig

Defined in: [src/types/config.ts:148](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/config.ts#L148)

Configuration for the Staking module.

Optional override for the core staking contract.

If omitted, the SDK uses the built-in chain-aware preset
for the configured `chainId`.

## Example

```ts
const sdk = new StarkZap({
  rpcUrl: "https://starknet-mainnet.infura.io/v3/YOUR_KEY",
  chainId: ChainId.MAINNET,
  staking: {
    contract: "0x03745ab04a431fc02871a139be6b93d9260b0ff3e779ad9c8b377183b23109f1",
  },
});
```

## Properties

### contract

> **contract**: [`Address`](../type-aliases/Address.md)

Defined in: [src/types/config.ts:150](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/config.ts#L150)

Address of the core staking contract (override default preset)
