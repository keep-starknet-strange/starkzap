[**starkzap**](../README.md)

***

[starkzap](../globals.md) / fromAddress

# Function: fromAddress()

> **fromAddress**(`value`): [`Address`](../type-aliases/Address.md)

Defined in: [src/types/address.ts:17](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/address.ts#L17)

Parse a Starknet address from a BigNumberish value.

## Parameters

### value

`BigNumberish`

The address to parse

## Returns

[`Address`](../type-aliases/Address.md)

The validated address

## Throws

Argument must be a valid address inside the address range bound
