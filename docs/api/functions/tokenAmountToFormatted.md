[**starkzap**](../README.md)

***

[starkzap](../globals.md) / tokenAmountToFormatted

# Function: tokenAmountToFormatted()

> **tokenAmountToFormatted**(`compressed?`, `balance`, `decimals`, `symbol`): `string`

Defined in: [src/types/amount.ts:855](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/amount.ts#L855)

Formats a token amount for display in the UI with locale-aware number formatting.

This standalone function is useful when you have raw balance data and want to
format it without creating an Amount instance. For most cases, prefer using
`Amount.toFormatted()` instead.

## Parameters

### compressed?

`boolean` = `false`

If true, limits decimal places to 4 for compact display

### balance

`bigint`

Raw base value as bigint (e.g., wei, FRI)

### decimals

`number`

Number of decimal places for the token

### symbol

`string`

Token symbol to append (e.g., "ETH", "STRK")

## Returns

`string`

Locale-formatted string with symbol

## Example

```ts
// Basic usage
tokenAmountToFormatted(false, 1500000000000000000n, 18, "ETH")
// Returns: "1.5 ETH" (exact format depends on locale)

// Compressed format for UI
tokenAmountToFormatted(true, 1234567890123456789n, 18, "ETH")
// Returns: "1.2346 ETH" (rounded to 4 decimal places)

// Large numbers with thousand separators
tokenAmountToFormatted(false, 1500000000000n, 6, "USDC")
// Returns: "1,500,000 USDC" (in US locale)
```
