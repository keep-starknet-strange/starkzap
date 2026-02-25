[**x**](../README.md)

---

[x](../globals.md) / getChainId

# Function: getChainId()

> **getChainId**(`provider`): `Promise`\<[`ChainId`](../classes/ChainId.md)\>

Defined in: [src/types/config.ts:102](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/config.ts#L102)

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
