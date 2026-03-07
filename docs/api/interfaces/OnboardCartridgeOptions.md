[**starkzap**](../README.md)

***

[starkzap](../globals.md) / OnboardCartridgeOptions

# Interface: OnboardCartridgeOptions

Defined in: [src/types/onboard.ts:62](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/onboard.ts#L62)

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

> **strategy**: `"cartridge"`

Defined in: [src/types/onboard.ts:63](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/onboard.ts#L63)

***

### cartridge?

> `optional` **cartridge**: [`OnboardCartridgeConfig`](OnboardCartridgeConfig.md)

Defined in: [src/types/onboard.ts:64](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/onboard.ts#L64)
