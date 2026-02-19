[**starkzap**](../README.md)

***

[starkzap](../globals.md) / PaymasterFeeMode

# Type Alias: PaymasterFeeMode

> **PaymasterFeeMode** = `StarknetFeeMode`

Defined in: [src/types/sponsorship.ts:25](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/sponsorship.ts#L25)

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
