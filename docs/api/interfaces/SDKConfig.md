[**x**](../README.md)

---

[x](../globals.md) / SDKConfig

# Interface: SDKConfig

Defined in: [src/types/config.ts:179](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/config.ts#L179)

Main configuration for the StarkSDK.

You can configure using a network preset or custom rpcUrl/chainId.

## Example

```ts
// Using a network preset (recommended)
const sdk = new StarkSDK({ network: "mainnet" });
const sdk = new StarkSDK({ network: "sepolia" });

// Using a preset object directly
import { networks } from "x";
const sdk = new StarkSDK({ network: networks.mainnet });

// Custom configuration
const sdk = new StarkSDK({
  rpcUrl: "https://my-rpc.example.com",
  chainId: ChainId.MAINNET,
});

// With custom paymaster endpoint
const sdk = new StarkSDK({
  network: "sepolia",
  paymaster: { nodeUrl: "https://custom-paymaster.example.com" },
});
```

## Properties

### network?

> `optional` **network**: `"devnet"` \| [`NetworkPreset`](NetworkPreset.md) \| `"mainnet"` \| `"sepolia"`

Defined in: [src/types/config.ts:181](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/config.ts#L181)

Use a network preset (e.g., "mainnet", "sepolia", or a NetworkPreset object)

---

### rpcUrl?

> `optional` **rpcUrl**: `string`

Defined in: [src/types/config.ts:183](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/config.ts#L183)

Starknet JSON-RPC endpoint URL (overrides network preset)

---

### chainId?

> `optional` **chainId**: [`ChainId`](../classes/ChainId.md)

Defined in: [src/types/config.ts:185](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/config.ts#L185)

Target chain (overrides network preset)

---

### paymaster?

> `optional` **paymaster**: [`PaymasterOptions`](PaymasterOptions.md)

Defined in: [src/types/config.ts:187](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/config.ts#L187)

Optional: custom paymaster config (default: AVNU paymaster)

---

### explorer?

> `optional` **explorer**: [`ExplorerConfig`](ExplorerConfig.md)

Defined in: [src/types/config.ts:189](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/config.ts#L189)

Optional: configures how explorer URLs are built

---

### staking?

> `optional` **staking**: [`StakingConfig`](StakingConfig.md)

Defined in: [src/types/config.ts:201](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/config.ts#L201)

Optional: configuration for the Staking module.

Required for staking functionality including:

- Entering and exiting delegation pools
- Adding to existing stakes and claiming rewards
- Querying validator pools and active staking tokens

#### See

[StakingConfig](StakingConfig.md)
