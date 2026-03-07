[**starkzap**](../README.md)

***

[starkzap](../globals.md) / getChainId

# Function: getChainId()

> **getChainId**(`provider`): `Promise`\<[`ChainId`](../classes/ChainId.md)\>

Defined in: [src/types/config.ts:102](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/config.ts#L102)

Detect the chain ID from an RPC provider.

## Parameters

### provider

[`RpcProvider`](../interfaces/RpcProvider.md)

The RPC provider to query

## Returns

`Promise`\<[`ChainId`](../classes/ChainId.md)\>

The detected ChainId

## Throws

Error if the provider returns an unsupported chain
