[**starkzap**](../README.md)

***

[starkzap](../globals.md) / Token

# Interface: Token

Defined in: [src/types/token.ts:26](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/token.ts#L26)

ERC20 token configuration.

## Example

```ts
// Use a preset
import { TBTC, USDC } from "starkzap";
sdk.erc20({ token: TBTC });

// Or define custom
sdk.erc20({
  token: {
    name: "My Token",
    address: "0x..." as Address,
    decimals: 18,
    symbol: "MY_TOKEN",
    metadata: {
      logoUrl: new URL("https://example.com/logo.png"),
    },
  }
});
```

## Properties

### name

> **name**: `string`

Defined in: [src/types/token.ts:28](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/token.ts#L28)

Human-readable name of the token

***

### address

> **address**: [`Address`](../type-aliases/Address.md)

Defined in: [src/types/token.ts:30](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/token.ts#L30)

Contract address of the token

***

### decimals

> **decimals**: `number`

Defined in: [src/types/token.ts:32](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/token.ts#L32)

Number of decimal places (e.g., 18 for ETH, 6 for USDC, 8 for BTC)

***

### symbol

> **symbol**: `string`

Defined in: [src/types/token.ts:34](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/token.ts#L34)

Token symbol for display

***

### metadata?

> `optional` **metadata**: [`TokenMetadata`](TokenMetadata.md)

Defined in: [src/types/token.ts:36](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/token.ts#L36)

Token metadata
