[**starkzap**](../README.md)

***

[starkzap](../globals.md) / Address

# Type Alias: Address

> **Address** = `string` & `object`

Defined in: [src/types/address.ts:9](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/address.ts#L9)

Branded type for Starknet addresses.

This provides compile-time type safety to distinguish addresses from
regular strings, while remaining a string at runtime.

## Type Declaration

### \_\_type

> `readonly` **\_\_type**: `"StarknetAddress"`
