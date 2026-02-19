[**starkzap**](../README.md)

***

[starkzap](../globals.md) / OnboardPrivyResolveResult

# Interface: OnboardPrivyResolveResult

Defined in: [src/types/onboard.ts:37](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/onboard.ts#L37)

## Properties

### walletId

> **walletId**: `string`

Defined in: [src/types/onboard.ts:38](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/onboard.ts#L38)

***

### publicKey

> **publicKey**: `string`

Defined in: [src/types/onboard.ts:39](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/onboard.ts#L39)

***

### serverUrl?

> `optional` **serverUrl**: `string`

Defined in: [src/types/onboard.ts:40](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/onboard.ts#L40)

***

### rawSign()?

> `optional` **rawSign**: (`walletId`, `messageHash`) => `Promise`\<`string`\>

Defined in: [src/types/onboard.ts:41](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/onboard.ts#L41)

#### Parameters

##### walletId

`string`

##### messageHash

`string`

#### Returns

`Promise`\<`string`\>

***

### headers?

> `optional` **headers**: `PrivySigningHeaders`

Defined in: [src/types/onboard.ts:42](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/onboard.ts#L42)

***

### buildBody?

> `optional` **buildBody**: `PrivySigningBody`

Defined in: [src/types/onboard.ts:43](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/onboard.ts#L43)

***

### requestTimeoutMs?

> `optional` **requestTimeoutMs**: `number`

Defined in: [src/types/onboard.ts:44](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/onboard.ts#L44)

***

### metadata?

> `optional` **metadata**: `Record`\<`string`, `unknown`\>

Defined in: [src/types/onboard.ts:45](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/onboard.ts#L45)
