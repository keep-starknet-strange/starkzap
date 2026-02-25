[**x**](../README.md)

---

[x](../globals.md) / StakingConfig

# Interface: StakingConfig

Defined in: [src/types/config.ts:146](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/config.ts#L146)

Configuration for the Staking module.

Required for using staking functionality such as entering/exiting pools,
querying validator pools, and retrieving active staking tokens.

## Example

```ts
const sdk = new StarkSDK({
  rpcUrl: "https://starknet-mainnet.infura.io/v3/YOUR_KEY",
  chainId: ChainId.MAINNET,
  staking: {
    contract:
      "0x03745ab04a431fc02871a139be6b93d9260b0ff3e779ad9c8b377183b23109f1",
  },
});
```

## Properties

### contract

> **contract**: [`Address`](../type-aliases/Address.md)

Defined in: [src/types/config.ts:148](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/config.ts#L148)

Address of the core staking contract
