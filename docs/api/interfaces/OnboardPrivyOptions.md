[**starkzap**](../README.md)

***

[starkzap](../globals.md) / OnboardPrivyOptions

# Interface: OnboardPrivyOptions

Defined in: [src/types/onboard.ts:59](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/onboard.ts#L59)

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

> **strategy**: `"privy"`

Defined in: [src/types/onboard.ts:60](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/onboard.ts#L60)

***

### privy

> **privy**: `object`

Defined in: [src/types/onboard.ts:61](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/onboard.ts#L61)

#### resolve()

> **resolve**: () => `Promise`\<[`OnboardPrivyResolveResult`](OnboardPrivyResolveResult.md)\>

##### Returns

`Promise`\<[`OnboardPrivyResolveResult`](OnboardPrivyResolveResult.md)\>

***

### accountPreset?

> `optional` **accountPreset**: `"devnet"` \| [`AccountClassConfig`](AccountClassConfig.md) \| `"openzeppelin"` \| `"argent"` \| `"braavos"` \| `"argentXV050"`

Defined in: [src/types/onboard.ts:64](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/onboard.ts#L64)
