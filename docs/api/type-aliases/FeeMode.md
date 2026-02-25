[**x**](../README.md)

---

[x](../globals.md) / FeeMode

# Type Alias: FeeMode

> **FeeMode** = `"sponsored"` \| `"user_pays"`

Defined in: [src/types/wallet.ts:68](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/wallet.ts#L68)

How transaction fees are paid.

- `"sponsored"`: Paymaster covers gas (requires SDK sponsor config)
- `"user_pays"`: User's account pays gas in ETH/STRK
