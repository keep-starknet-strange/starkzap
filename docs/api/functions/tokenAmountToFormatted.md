[**starkzap**](../README.md)

***

[starkzap](../globals.md) / tokenAmountToFormatted

# Function: tokenAmountToFormatted()

> **tokenAmountToFormatted**(`compressed?`, `balance`, `decimals`, `symbol`): `string`

Defined in: [src/types/amount.ts:701](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/amount.ts#L701)

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

## Remarks

Current implementation converts to float for formatting, which may lose precision
for very large or very precise values. A future improvement would use
`Intl.NumberFormat.formatToParts` for lossless formatting, but this is not
currently polyfilled for React Native.

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
