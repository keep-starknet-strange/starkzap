[**starkzap**](../README.md)

***

[starkzap](../globals.md) / AccountConfig

# Interface: AccountConfig

Defined in: [src/types/wallet.ts:54](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/wallet.ts#L54)

Full account configuration for connecting a wallet.

## Example

```ts
import { StarkSigner, OpenZeppelinPreset } from "starkzap";

{
  signer: new StarkSigner(privateKey),
  accountClass: OpenZeppelinPreset, // optional, defaults to OpenZeppelin
}
```

## Properties

### signer

> **signer**: [`SignerInterface`](SignerInterface.md)

Defined in: [src/types/wallet.ts:56](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/wallet.ts#L56)

Signer for transaction signing

***

### accountClass?

> `optional` **accountClass**: [`AccountClassConfig`](AccountClassConfig.md)

Defined in: [src/types/wallet.ts:58](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/wallet.ts#L58)

Account class configuration (default: OpenZeppelin)
