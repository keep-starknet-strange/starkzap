[**starkzap**](../README.md)

***

[starkzap](../globals.md) / SwapInput

# Type Alias: SwapInput

> **SwapInput** = `Omit`\<[`SwapRequest`](SwapRequest.md), `"chainId"` \| `"takerAddress"`\> & `object`

Defined in: [src/swap/interface.ts:45](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/swap/interface.ts#L45)

User-facing swap input accepted by wallet helpers.

Wallet methods auto-fill:
- `chainId` from the connected wallet chain
- `takerAddress` from the connected wallet address

## Type Declaration

### chainId?

> `optional` **chainId**: [`ChainId`](../classes/ChainId.md)

### takerAddress?

> `optional` **takerAddress**: [`Address`](Address.md)

### provider?

> `optional` **provider**: [`SwapProvider`](SwapProvider.md) \| `string`

Optional source provider or provider id; wallet default is used when omitted.
