[**starkzap**](../README.md)

***

[starkzap](../globals.md) / fromAddress

# Function: fromAddress()

> **fromAddress**(`value`): [`Address`](../type-aliases/Address.md)

Defined in: [src/types/address.ts:17](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/address.ts#L17)

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
