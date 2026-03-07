[**starkzap**](../README.md)

***

[starkzap](../globals.md) / ConnectWalletOptions

# Interface: ConnectWalletOptions

Defined in: [src/types/wallet.ts:94](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/wallet.ts#L94)

Options for `sdk.connectWallet()`.

## Example

```ts
import { StarkSigner, ArgentPreset } from "starkzap";

// User pays fees
await sdk.connectWallet({
  account: {
    signer: new StarkSigner(privateKey),
    accountClass: ArgentPreset,
  },
});

// Sponsored via AVNU paymaster
await sdk.connectWallet({
  account: { signer: new StarkSigner(privateKey) },
  feeMode: "sponsored",
});
```

## Properties

### account

> **account**: [`AccountConfig`](AccountConfig.md)

Defined in: [src/types/wallet.ts:96](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/wallet.ts#L96)

Account configuration

***

### feeMode?

> `optional` **feeMode**: [`FeeMode`](../type-aliases/FeeMode.md)

Defined in: [src/types/wallet.ts:98](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/wallet.ts#L98)

How fees are paid (default: "user_pays")

***

### timeBounds?

> `optional` **timeBounds**: [`PaymasterTimeBounds`](PaymasterTimeBounds.md)

Defined in: [src/types/wallet.ts:100](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/wallet.ts#L100)

Optional time bounds for paymaster transactions
