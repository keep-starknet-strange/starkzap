[**starkzap**](../README.md)

***

[starkzap](../globals.md) / OnboardPrivyResolveResult

# Interface: OnboardPrivyResolveResult

Defined in: [src/types/onboard.ts:42](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/onboard.ts#L42)

## Properties

### walletId

> **walletId**: `string`

Defined in: [src/types/onboard.ts:43](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/onboard.ts#L43)

***

### publicKey

> **publicKey**: `string`

Defined in: [src/types/onboard.ts:44](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/onboard.ts#L44)

***

### serverUrl?

> `optional` **serverUrl**: `string`

Defined in: [src/types/onboard.ts:45](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/onboard.ts#L45)

***

### rawSign()?

> `optional` **rawSign**: (`walletId`, `messageHash`) => `Promise`\<`string`\>

Defined in: [src/types/onboard.ts:46](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/onboard.ts#L46)

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

Defined in: [src/types/onboard.ts:47](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/onboard.ts#L47)

***

### buildBody?

> `optional` **buildBody**: `PrivySigningBody`

Defined in: [src/types/onboard.ts:48](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/onboard.ts#L48)

***

### requestTimeoutMs?

> `optional` **requestTimeoutMs**: `number`

Defined in: [src/types/onboard.ts:49](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/onboard.ts#L49)

***

### metadata?

> `optional` **metadata**: `Record`\<`string`, `unknown`\>

Defined in: [src/types/onboard.ts:50](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/onboard.ts#L50)
