[**starkzap**](../README.md)

***

[starkzap](../globals.md) / SDKConfig

# Interface: SDKConfig

Defined in: [src/types/config.ts:181](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/config.ts#L181)

Main configuration for the StarkZap.

You can configure using a network preset or custom rpcUrl/chainId.

## Example

```ts
// Using a network preset (recommended)
const sdk = new StarkZap({ network: "mainnet" });
const sdk = new StarkZap({ network: "sepolia" });

// Using a preset object directly
import { networks } from "starkzap";
const sdk = new StarkZap({ network: networks.mainnet });

// Custom configuration
const sdk = new StarkZap({
  rpcUrl: "https://my-rpc.example.com",
  chainId: ChainId.MAINNET,
});

// With custom paymaster endpoint
const sdk = new StarkZap({
  network: "sepolia",
  paymaster: { nodeUrl: "https://custom-paymaster.example.com" },
});
```

## Properties

### network?

> `optional` **network**: [`NetworkPreset`](NetworkPreset.md) \| `"mainnet"` \| `"sepolia"` \| `"devnet"`

Defined in: [src/types/config.ts:183](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/config.ts#L183)

Use a network preset (e.g., "mainnet", "sepolia", or a NetworkPreset object)

***

### rpcUrl?

> `optional` **rpcUrl**: `string`

Defined in: [src/types/config.ts:185](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/config.ts#L185)

Starknet JSON-RPC endpoint URL (overrides network preset)

***

### chainId?

> `optional` **chainId**: [`ChainId`](../classes/ChainId.md)

Defined in: [src/types/config.ts:187](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/config.ts#L187)

Target chain (overrides network preset)

***

### paymaster?

> `optional` **paymaster**: [`PaymasterOptions`](PaymasterOptions.md)

Defined in: [src/types/config.ts:189](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/config.ts#L189)

Optional: custom paymaster config (default: AVNU paymaster)

***

### explorer?

> `optional` **explorer**: [`ExplorerConfig`](ExplorerConfig.md)

Defined in: [src/types/config.ts:191](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/config.ts#L191)

Optional: configures how explorer URLs are built

***

### staking?

> `optional` **staking**: [`StakingConfig`](StakingConfig.md)

Defined in: [src/types/config.ts:203](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/config.ts#L203)

Optional: configuration for the Staking module (override default preset).

Staking functionality includes:
- Entering and exiting delegation pools
- Adding to existing stakes and claiming rewards
- Querying validator pools and active staking tokens

#### See

[StakingConfig](StakingConfig.md)
