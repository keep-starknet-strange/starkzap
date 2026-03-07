[**starkzap**](../README.md)

***

[starkzap](../globals.md) / SwapRequest

# Type Alias: SwapRequest

> **SwapRequest** = `object`

Defined in: [src/swap/interface.ts:23](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/swap/interface.ts#L23)

Common swap request shape used by all providers.

## Properties

### chainId

> **chainId**: [`ChainId`](../classes/ChainId.md)

Defined in: [src/swap/interface.ts:25](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/swap/interface.ts#L25)

Target chain

***

### takerAddress?

> `optional` **takerAddress**: [`Address`](Address.md)

Defined in: [src/swap/interface.ts:27](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/swap/interface.ts#L27)

Optional taker/executor wallet address for provider-specific routing

***

### tokenIn

> **tokenIn**: [`Token`](../interfaces/Token.md)

Defined in: [src/swap/interface.ts:29](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/swap/interface.ts#L29)

Token being sold

***

### tokenOut

> **tokenOut**: [`Token`](../interfaces/Token.md)

Defined in: [src/swap/interface.ts:31](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/swap/interface.ts#L31)

Token being bought

***

### amountIn

> **amountIn**: [`Amount`](../classes/Amount.md)

Defined in: [src/swap/interface.ts:33](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/swap/interface.ts#L33)

Amount being sold

***

### slippageBps?

> `optional` **slippageBps**: `bigint`

Defined in: [src/swap/interface.ts:35](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/swap/interface.ts#L35)

Optional slippage tolerance in basis points
