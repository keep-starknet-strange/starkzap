[**starkzap**](../README.md)

***

[starkzap](../globals.md) / OnboardBaseOptions

# Interface: OnboardBaseOptions

Defined in: [src/types/onboard.ts:30](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/onboard.ts#L30)

## Extended by

- [`OnboardSignerOptions`](OnboardSignerOptions.md)
- [`OnboardPrivyOptions`](OnboardPrivyOptions.md)
- [`OnboardCartridgeOptions`](OnboardCartridgeOptions.md)

## Properties

### feeMode?

> `optional` **feeMode**: [`FeeMode`](../type-aliases/FeeMode.md)

Defined in: [src/types/onboard.ts:31](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/onboard.ts#L31)

***

### timeBounds?

> `optional` **timeBounds**: [`PaymasterTimeBounds`](PaymasterTimeBounds.md)

Defined in: [src/types/onboard.ts:32](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/onboard.ts#L32)

***

### deploy?

> `optional` **deploy**: [`DeployMode`](../type-aliases/DeployMode.md)

Defined in: [src/types/onboard.ts:33](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/onboard.ts#L33)

***

### onProgress()?

> `optional` **onProgress**: (`event`) => `void`

Defined in: [src/types/onboard.ts:34](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/onboard.ts#L34)

#### Parameters

##### event

[`ProgressEvent`](ProgressEvent.md)

#### Returns

`void`
