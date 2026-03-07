[**starkzap**](../README.md)

***

[starkzap](../globals.md) / BraavosPreset

# Variable: BraavosPreset

> `const` **BraavosPreset**: [`AccountClassConfig`](../interfaces/AccountClassConfig.md)

Defined in: [src/account/presets.ts:66](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/account/presets.ts#L66)

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
