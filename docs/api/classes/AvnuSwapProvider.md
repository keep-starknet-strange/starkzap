[**starkzap**](../README.md)

***

[starkzap](../globals.md) / AvnuSwapProvider

# Class: AvnuSwapProvider

Defined in: [src/swap/avnu.ts:89](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/swap/avnu.ts#L89)

## Implements

- [`SwapProvider`](../type-aliases/SwapProvider.md)

## Constructors

### Constructor

> **new AvnuSwapProvider**(`options?`): `AvnuSwapProvider`

Defined in: [src/swap/avnu.ts:95](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/swap/avnu.ts#L95)

#### Parameters

##### options?

[`AvnuSwapProviderOptions`](../interfaces/AvnuSwapProviderOptions.md) = `{}`

#### Returns

`AvnuSwapProvider`

## Properties

### id

> `readonly` **id**: `"avnu"` = `"avnu"`

Defined in: [src/swap/avnu.ts:90](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/swap/avnu.ts#L90)

Stable provider identifier (e.g. `"ekubo"`)

#### Implementation of

`SwapProvider.id`

## Methods

### supportsChain()

> **supportsChain**(`chainId`): `boolean`

Defined in: [src/swap/avnu.ts:107](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/swap/avnu.ts#L107)

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

Defined in: [src/swap/avnu.ts:112](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/swap/avnu.ts#L112)

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

Defined in: [src/swap/avnu.ts:118](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/swap/avnu.ts#L118)

Build a prepared swap (calls + quote) from protocol-specific routing logic

#### Parameters

##### request

[`SwapRequest`](../type-aliases/SwapRequest.md)

#### Returns

`Promise`\<[`PreparedSwap`](../type-aliases/PreparedSwap.md)\>

#### Implementation of

`SwapProvider.swap`
