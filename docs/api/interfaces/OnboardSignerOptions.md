[**starkzap**](../README.md)

***

[starkzap](../globals.md) / OnboardSignerOptions

# Interface: OnboardSignerOptions

Defined in: [src/types/onboard.ts:48](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/onboard.ts#L48)

## Extends

- [`OnboardBaseOptions`](OnboardBaseOptions.md)

## Properties

### feeMode?

> `optional` **feeMode**: [`FeeMode`](../type-aliases/FeeMode.md)

Defined in: [src/types/onboard.ts:31](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/onboard.ts#L31)

#### Inherited from

[`OnboardBaseOptions`](OnboardBaseOptions.md).[`feeMode`](OnboardBaseOptions.md#feemode)

***

### timeBounds?

> `optional` **timeBounds**: [`PaymasterTimeBounds`](PaymasterTimeBounds.md)

Defined in: [src/types/onboard.ts:32](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/onboard.ts#L32)

#### Inherited from

[`OnboardBaseOptions`](OnboardBaseOptions.md).[`timeBounds`](OnboardBaseOptions.md#timebounds)

***

### deploy?

> `optional` **deploy**: [`DeployMode`](../type-aliases/DeployMode.md)

Defined in: [src/types/onboard.ts:33](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/onboard.ts#L33)

#### Inherited from

[`OnboardBaseOptions`](OnboardBaseOptions.md).[`deploy`](OnboardBaseOptions.md#deploy)

***

### onProgress()?

> `optional` **onProgress**: (`event`) => `void`

Defined in: [src/types/onboard.ts:34](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/onboard.ts#L34)

#### Parameters

##### event

[`ProgressEvent`](ProgressEvent.md)

#### Returns

`void`

#### Inherited from

[`OnboardBaseOptions`](OnboardBaseOptions.md).[`onProgress`](OnboardBaseOptions.md#onprogress)

***

### strategy

> **strategy**: `"signer"`

Defined in: [src/types/onboard.ts:49](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/onboard.ts#L49)

***

### account

> **account**: [`AccountConfig`](AccountConfig.md)

Defined in: [src/types/onboard.ts:50](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/onboard.ts#L50)

***

### accountPreset?

> `optional` **accountPreset**: `"devnet"` \| [`AccountClassConfig`](AccountClassConfig.md) \| `"openzeppelin"` \| `"argent"` \| `"braavos"` \| `"argentXV050"`

Defined in: [src/types/onboard.ts:51](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/onboard.ts#L51)
