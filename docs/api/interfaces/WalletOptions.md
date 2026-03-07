[**starkzap**](../README.md)

***

[starkzap](../globals.md) / WalletOptions

# Interface: WalletOptions

Defined in: [src/wallet/index.ts:55](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/index.ts#L55)

Options for creating a Wallet.

## Properties

### account

> **account**: [`AccountProvider`](../classes/AccountProvider.md) \| \{ `signer`: [`SignerInterface`](SignerInterface.md); `accountClass?`: [`AccountClassConfig`](AccountClassConfig.md); \}

Defined in: [src/wallet/index.ts:57](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/index.ts#L57)

Account: either AccountProvider or { signer, accountClass? }

***

### provider

> **provider**: [`RpcProvider`](RpcProvider.md)

Defined in: [src/wallet/index.ts:61](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/index.ts#L61)

RPC provider

***

### config

> **config**: [`SDKConfig`](SDKConfig.md)

Defined in: [src/wallet/index.ts:63](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/index.ts#L63)

SDK configuration

***

### accountAddress?

> `optional` **accountAddress**: [`Address`](../type-aliases/Address.md)

Defined in: [src/wallet/index.ts:65](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/index.ts#L65)

Known address (skips address computation if provided)

***

### feeMode?

> `optional` **feeMode**: [`FeeMode`](../type-aliases/FeeMode.md)

Defined in: [src/wallet/index.ts:67](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/index.ts#L67)

Default fee mode (default: "user_pays")

***

### timeBounds?

> `optional` **timeBounds**: [`PaymasterTimeBounds`](PaymasterTimeBounds.md)

Defined in: [src/wallet/index.ts:69](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/index.ts#L69)

Default time bounds for paymaster transactions

***

### swapProviders?

> `optional` **swapProviders**: [`SwapProvider`](../type-aliases/SwapProvider.md)[]

Defined in: [src/wallet/index.ts:71](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/index.ts#L71)

Optional additional swap providers to register on this wallet

***

### defaultSwapProviderId?

> `optional` **defaultSwapProviderId**: `string`

Defined in: [src/wallet/index.ts:73](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/index.ts#L73)

Optional default swap provider id (must be registered)
