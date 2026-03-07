[**starkzap**](../README.md)

***

[starkzap](../globals.md) / PaymasterFeeMode

# Type Alias: PaymasterFeeMode

> **PaymasterFeeMode** = `StarknetFeeMode`

Defined in: [src/types/sponsorship.ts:25](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/sponsorship.ts#L25)

Fee mode for paymaster transactions.
- `{ mode: 'sponsored' }`: AVNU paymaster covers gas
- `{ mode: 'default', gasToken: '0x...' }`: Pay in specified token

## Example

```ts
// Sponsored (gasless)
{ mode: 'sponsored' }

// Pay in STRK
{ mode: 'default', gasToken: STRK_ADDRESS }
```
