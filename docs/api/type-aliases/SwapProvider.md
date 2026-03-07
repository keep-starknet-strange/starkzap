[**starkzap**](../README.md)

***

[starkzap](../globals.md) / SwapProvider

# Type Alias: SwapProvider

> **SwapProvider** = `object`

Defined in: [src/swap/interface.ts:67](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/swap/interface.ts#L67)

High-level provider contract for multi-protocol swap integrations.

Implement this interface for each protocol (Ekubo, AVNU, etc.).

## Properties

### id

> `readonly` **id**: `string`

Defined in: [src/swap/interface.ts:69](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/swap/interface.ts#L69)

Stable provider identifier (e.g. `"ekubo"`)

## Methods

### supportsChain()

> **supportsChain**(`chainId`): `boolean`

Defined in: [src/swap/interface.ts:71](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/swap/interface.ts#L71)

Chain support guard

#### Parameters

##### chainId

[`ChainId`](../classes/ChainId.md)

#### Returns

`boolean`

***

### getQuote()

> **getQuote**(`request`): `Promise`\<[`SwapQuote`](SwapQuote.md)\>

Defined in: [src/swap/interface.ts:73](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/swap/interface.ts#L73)

Fetch a provider quote for the request

#### Parameters

##### request

[`SwapRequest`](SwapRequest.md)

#### Returns

`Promise`\<[`SwapQuote`](SwapQuote.md)\>

***

### swap()

> **swap**(`request`): `Promise`\<[`PreparedSwap`](PreparedSwap.md)\>

Defined in: [src/swap/interface.ts:75](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/swap/interface.ts#L75)

Build a prepared swap (calls + quote) from protocol-specific routing logic

#### Parameters

##### request

[`SwapRequest`](SwapRequest.md)

#### Returns

`Promise`\<[`PreparedSwap`](PreparedSwap.md)\>
