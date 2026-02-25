[**x**](../README.md)

---

[x](../globals.md) / BraavosPreset

# Variable: BraavosPreset

> `const` **BraavosPreset**: [`AccountClassConfig`](../interfaces/AccountClassConfig.md)

Defined in: [src/account/presets.ts:65](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/account/presets.ts#L65)

Braavos account preset (v1.2.0) with Stark key.

Uses BraavosBaseAccount for deployment which then upgrades to BraavosAccount.

Deployment signature format (15 elements):

- [0-1]: Transaction signature (r, s)
- [2]: Implementation class hash (BraavosAccount)
- [3-11]: Auxiliary data (zeros for basic Stark-only account)
- [12]: Chain ID as felt
- [13-14]: Auxiliary data signature (r, s)

## See

https://github.com/myBraavos/braavos-account-cairo
