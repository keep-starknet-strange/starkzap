[**x**](../README.md)

---

[x](../globals.md) / AccountConfig

# Interface: AccountConfig

Defined in: [src/types/wallet.ts:54](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/wallet.ts#L54)

Full account configuration for connecting a wallet.

## Example

```ts
import { StarkSigner, OpenZeppelinPreset } from "x";

{
  signer: new StarkSigner(privateKey),
  accountClass: OpenZeppelinPreset, // optional, defaults to OpenZeppelin
}
```

## Properties

### signer

> **signer**: [`SignerInterface`](SignerInterface.md)

Defined in: [src/types/wallet.ts:56](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/wallet.ts#L56)

Signer for transaction signing

---

### accountClass?

> `optional` **accountClass**: [`AccountClassConfig`](AccountClassConfig.md)

Defined in: [src/types/wallet.ts:58](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/wallet.ts#L58)

Account class configuration (default: OpenZeppelin)
