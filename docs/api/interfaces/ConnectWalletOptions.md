[**starkzap**](../README.md)

***

[starkzap](../globals.md) / ConnectWalletOptions

# Interface: ConnectWalletOptions

Defined in: [src/types/wallet.ts:95](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/wallet.ts#L95)

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

Defined in: [src/types/wallet.ts:97](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/wallet.ts#L97)

Account configuration

***

### feeMode?

> `optional` **feeMode**: [`FeeMode`](../type-aliases/FeeMode.md)

Defined in: [src/types/wallet.ts:99](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/wallet.ts#L99)

How fees are paid (default: "user_pays")

***

### timeBounds?

> `optional` **timeBounds**: [`PaymasterTimeBounds`](PaymasterTimeBounds.md)

Defined in: [src/types/wallet.ts:101](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/wallet.ts#L101)

Optional time bounds for paymaster transactions

***

### swapProviders?

> `optional` **swapProviders**: [`SwapProvider`](../type-aliases/SwapProvider.md)[]

Defined in: [src/types/wallet.ts:103](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/wallet.ts#L103)

Optional additional swap providers to register on the connected wallet

***

### defaultSwapProviderId?

> `optional` **defaultSwapProviderId**: `string`

Defined in: [src/types/wallet.ts:105](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/wallet.ts#L105)

Optional default swap provider id (must be registered)
