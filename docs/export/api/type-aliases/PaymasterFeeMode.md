[**x**](../README.md)

---

[x](../globals.md) / PaymasterFeeMode

# Type Alias: PaymasterFeeMode

> **PaymasterFeeMode** = `StarknetFeeMode`

Defined in: [src/types/sponsorship.ts:25](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/sponsorship.ts#L25)

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
