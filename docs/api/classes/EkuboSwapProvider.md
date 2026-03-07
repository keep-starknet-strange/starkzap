[**starkzap**](../README.md)

***

[starkzap](../globals.md) / EkuboSwapProvider

# Class: EkuboSwapProvider

Defined in: [src/swap/ekubo.ts:65](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/swap/ekubo.ts#L65)

## Implements

- [`SwapProvider`](../type-aliases/SwapProvider.md)

## Constructors

### Constructor

> **new EkuboSwapProvider**(`options?`): `EkuboSwapProvider`

Defined in: [src/swap/ekubo.ts:71](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/swap/ekubo.ts#L71)

#### Parameters

##### options?

[`EkuboSwapProviderOptions`](../interfaces/EkuboSwapProviderOptions.md) = `{}`

#### Returns

`EkuboSwapProvider`

## Properties

### id

> `readonly` **id**: `"ekubo"` = `"ekubo"`

Defined in: [src/swap/ekubo.ts:66](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/swap/ekubo.ts#L66)

Stable provider identifier (e.g. `"ekubo"`)

#### Implementation of

`SwapProvider.id`

## Methods

### supportsChain()

> **supportsChain**(`chainId`): `boolean`

Defined in: [src/swap/ekubo.ts:76](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/swap/ekubo.ts#L76)

Chain support guard

#### Parameters

##### chainId

[`ChainId`](ChainId.md)

#### Returns

`boolean`

#### Implementation of

`SwapProvider.supportsChain`

***

### getQuote()

> **getQuote**(`request`): `Promise`\<[`SwapQuote`](../type-aliases/SwapQuote.md)\>

Defined in: [src/swap/ekubo.ts:81](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/swap/ekubo.ts#L81)

Fetch a provider quote for the request

#### Parameters

##### request

[`SwapRequest`](../type-aliases/SwapRequest.md)

#### Returns

`Promise`\<[`SwapQuote`](../type-aliases/SwapQuote.md)\>

#### Implementation of

`SwapProvider.getQuote`

***

### swap()

> **swap**(`request`): `Promise`\<[`PreparedSwap`](../type-aliases/PreparedSwap.md)\>

Defined in: [src/swap/ekubo.ts:87](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/swap/ekubo.ts#L87)

Build a prepared swap (calls + quote) from protocol-specific routing logic

#### Parameters

##### request

[`SwapRequest`](../type-aliases/SwapRequest.md)

#### Returns

`Promise`\<[`PreparedSwap`](../type-aliases/PreparedSwap.md)\>

#### Implementation of

`SwapProvider.swap`
