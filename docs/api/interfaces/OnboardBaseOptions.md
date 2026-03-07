[**starkzap**](../README.md)

***

[starkzap](../globals.md) / OnboardBaseOptions

# Interface: OnboardBaseOptions

Defined in: [src/types/onboard.ts:31](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/onboard.ts#L31)

## Extended by

- [`OnboardSignerOptions`](OnboardSignerOptions.md)
- [`OnboardPrivyOptions`](OnboardPrivyOptions.md)
- [`OnboardCartridgeOptions`](OnboardCartridgeOptions.md)

## Properties

### feeMode?

> `optional` **feeMode**: [`FeeMode`](../type-aliases/FeeMode.md)

Defined in: [src/types/onboard.ts:32](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/onboard.ts#L32)

***

### timeBounds?

> `optional` **timeBounds**: [`PaymasterTimeBounds`](PaymasterTimeBounds.md)

Defined in: [src/types/onboard.ts:33](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/onboard.ts#L33)

***

### deploy?

> `optional` **deploy**: [`DeployMode`](../type-aliases/DeployMode.md)

Defined in: [src/types/onboard.ts:34](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/onboard.ts#L34)

***

### onProgress()?

> `optional` **onProgress**: (`event`) => `void`

Defined in: [src/types/onboard.ts:35](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/onboard.ts#L35)

#### Parameters

##### event

[`ProgressEvent`](ProgressEvent.md)

#### Returns

`void`

***

### swapProviders?

> `optional` **swapProviders**: [`SwapProvider`](../type-aliases/SwapProvider.md)[]

Defined in: [src/types/onboard.ts:37](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/onboard.ts#L37)

Optional additional swap providers to register on the wallet

***

### defaultSwapProviderId?

> `optional` **defaultSwapProviderId**: `string`

Defined in: [src/types/onboard.ts:39](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/onboard.ts#L39)

Optional default swap provider id (must be registered)
