[**starkzap**](../README.md)

***

[starkzap](../globals.md) / getChainId

# Function: getChainId()

> **getChainId**(`provider`): `Promise`\<[`ChainId`](../classes/ChainId.md)\>

Defined in: [src/types/config.ts:102](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/config.ts#L102)

Detect the chain ID from an RPC provider.

## Parameters

### provider

`RpcProvider`

The RPC provider to query

## Returns

`Promise`\<[`ChainId`](../classes/ChainId.md)\>

The detected ChainId

## Throws

Error if the provider returns an unsupported chain
