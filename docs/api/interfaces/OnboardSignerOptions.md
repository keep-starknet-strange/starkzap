[**starkzap**](../README.md)

***

[starkzap](../globals.md) / OnboardSignerOptions

# Interface: OnboardSignerOptions

Defined in: [src/types/onboard.ts:53](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/onboard.ts#L53)

## Extends

- [`OnboardBaseOptions`](OnboardBaseOptions.md)

## Properties

### feeMode?

> `optional` **feeMode**: [`FeeMode`](../type-aliases/FeeMode.md)

Defined in: [src/types/onboard.ts:32](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/onboard.ts#L32)

#### Inherited from

[`OnboardBaseOptions`](OnboardBaseOptions.md).[`feeMode`](OnboardBaseOptions.md#feemode)

***

### timeBounds?

> `optional` **timeBounds**: [`PaymasterTimeBounds`](PaymasterTimeBounds.md)

Defined in: [src/types/onboard.ts:33](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/onboard.ts#L33)

#### Inherited from

[`OnboardBaseOptions`](OnboardBaseOptions.md).[`timeBounds`](OnboardBaseOptions.md#timebounds)

***

### deploy?

> `optional` **deploy**: [`DeployMode`](../type-aliases/DeployMode.md)

Defined in: [src/types/onboard.ts:34](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/onboard.ts#L34)

#### Inherited from

[`OnboardBaseOptions`](OnboardBaseOptions.md).[`deploy`](OnboardBaseOptions.md#deploy)

***

### onProgress()?

> `optional` **onProgress**: (`event`) => `void`

Defined in: [src/types/onboard.ts:35](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/onboard.ts#L35)

#### Parameters

##### event

[`ProgressEvent`](ProgressEvent.md)

#### Returns

`void`

#### Inherited from

[`OnboardBaseOptions`](OnboardBaseOptions.md).[`onProgress`](OnboardBaseOptions.md#onprogress)

***

### swapProviders?

> `optional` **swapProviders**: [`SwapProvider`](../type-aliases/SwapProvider.md)[]

Defined in: [src/types/onboard.ts:37](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/onboard.ts#L37)

Optional additional swap providers to register on the wallet

#### Inherited from

[`OnboardBaseOptions`](OnboardBaseOptions.md).[`swapProviders`](OnboardBaseOptions.md#swapproviders)

***

### defaultSwapProviderId?

> `optional` **defaultSwapProviderId**: `string`

Defined in: [src/types/onboard.ts:39](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/onboard.ts#L39)

Optional default swap provider id (must be registered)

#### Inherited from

[`OnboardBaseOptions`](OnboardBaseOptions.md).[`defaultSwapProviderId`](OnboardBaseOptions.md#defaultswapproviderid)

***

### strategy

> **strategy**: `"signer"`

Defined in: [src/types/onboard.ts:54](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/onboard.ts#L54)

***

### account

> **account**: [`AccountConfig`](AccountConfig.md)

Defined in: [src/types/onboard.ts:55](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/onboard.ts#L55)

***

### accountPreset?

> `optional` **accountPreset**: `"devnet"` \| [`AccountClassConfig`](AccountClassConfig.md) \| `"openzeppelin"` \| `"argent"` \| `"braavos"` \| `"argentXV050"`

Defined in: [src/types/onboard.ts:56](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/onboard.ts#L56)
