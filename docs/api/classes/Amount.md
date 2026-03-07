[**starkzap**](../README.md)

***

[starkzap](../globals.md) / Amount

# Class: Amount

Defined in: [src/types/amount.ts:186](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/amount.ts#L186)

Represents a token amount with precision handling for blockchain operations.

The Amount class provides a safe way to handle token amounts by distinguishing between:
- **Unit values**: Human-readable values (e.g., 1.5 ETH, 100 USDC)
- **Raw values**: Raw blockchain values with full precision (e.g., 1500000000000000000 wei)

This separation prevents common precision errors when working with blockchain token amounts.

## Example

```ts
// Creating from human-readable values with a Token
const strkAmount = Amount.parse("10", STRK);
const usdcAmount = Amount.parse(100, USDC);

// Creating from human-readable values with decimals
const ethAmount = Amount.parse("1.5", 18, "ETH");

// Creating from raw blockchain values with a Token
const balance = Amount.fromRaw(1500000000000000000n, ETH);

// Creating from raw blockchain values with decimals
const rawAmount = Amount.fromRaw(1500000000000000000n, 18, "ETH");

// Converting for display or contract calls
console.log(ethAmount.toUnit());      // "1.5"
console.log(ethAmount.toBase());      // 1500000000000000000n
console.log(ethAmount.toFormatted()); // "1.5 ETH" (locale-formatted)
```

## Methods

### parse()

> `static` **parse**(`amount`, ...`args`): `Amount`

Defined in: [src/types/amount.ts:238](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/amount.ts#L238)

Creates an Amount from a human-readable unit value (e.g., "1.5" ETH).

Use this method when you have a value that a user would recognize,
like "1.5" for 1.5 ETH or "100" for 100 USDC.

#### Parameters

##### amount

`BigNumberish`

The unit amount as string, number, or bigint

##### args

...[`AmountArgs`](../type-aliases/AmountArgs.md)

Either a `Token` object, or `decimals` and optional `symbol`:
  - `(token: Token)` - Uses the token's decimals and symbol
  - `(decimals: number, symbol?: string)` - Uses explicit decimals and optional symbol

#### Returns

`Amount`

A new Amount instance

#### Throws

Error if the amount format is invalid (negative, non-numeric)

#### Throws

Error if the amount exceeds the specified decimal precision

#### Example

```ts
// With a Token (recommended for known tokens)
Amount.parse("1.5", STRK)          // Uses STRK's decimals and symbol
Amount.parse(100, USDC)            // Uses USDC's decimals and symbol

// With decimals and optional symbol
Amount.parse("1.5", 18, "ETH")     // 1.5 ETH = 1500000000000000000 wei
Amount.parse(1.5, 18, "ETH")       // Same as above (number input)
Amount.parse(10n, 18, "ETH")       // 10 ETH (bigint treated as whole units)
Amount.parse("100", 6, "USDC")     // 100 USDC = 100000000 base units
Amount.parse("0.5", 8)             // 0.5 with 8 decimals, no symbol
```

***

### fromRaw()

> `static` **fromRaw**(`amount`, ...`args`): `Amount`

Defined in: [src/types/amount.ts:304](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/amount.ts#L304)

Creates an Amount directly from a raw value (e.g., wei, FRI, satoshis).

Use this method when you have a value directly from the blockchain,
such as a balance query or transaction amount.

#### Parameters

##### amount

`BigNumberish`

The raw amount as string, number, or bigint

##### args

...[`AmountArgs`](../type-aliases/AmountArgs.md)

Either a `Token` object, or `decimals` and optional `symbol`:
  - `(token: Token)` - Uses the token's decimals and symbol
  - `(decimals: number, symbol?: string)` - Uses explicit decimals and optional symbol

#### Returns

`Amount`

A new Amount instance

#### Throws

Error if the amount is negative

#### Example

```ts
// With a Token (recommended for known tokens)
const balance = await contract.balanceOf(address);
Amount.fromRaw(balance, STRK)                    // Uses STRK's decimals and symbol

// With decimals and optional symbol
Amount.fromRaw(1500000000000000000n, 18, "ETH")  // 1.5 ETH
Amount.fromRaw("1500000000000000000", 18, "ETH") // From string (e.g., JSON response)
Amount.fromRaw(1000000, 6, "USDC")               // 1 USDC
Amount.fromRaw(1000000n, 6)                      // 1 unit, no symbol
```

***

### toBase()

> **toBase**(): `bigint`

Defined in: [src/types/amount.ts:353](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/amount.ts#L353)

Returns the raw base value as a bigint for use in smart contract calls.

This is the value you should pass to Starknet contracts and other
blockchain operations that expect raw token amounts.

#### Returns

`bigint`

The raw base value as bigint (e.g., wei, FRI)

#### Example

```ts
const amount = Amount.parse("1.5", 18, "ETH");
const rawValue = amount.toBase(); // 1500000000000000000n

// Use in contract call
await contract.transfer(recipient, rawValue);
```

***

### toUnit()

> **toUnit**(): `string`

Defined in: [src/types/amount.ts:373](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/amount.ts#L373)

Returns the human-readable unit value as a string.

This is the value suitable for displaying to users. Trailing zeros
after the decimal point are automatically removed.

#### Returns

`string`

The unit value as a string (e.g., "1.5", "100", "0.001")

#### Example

```ts
Amount.fromRaw(1500000000000000000n, 18).toUnit()  // "1.5"
Amount.fromRaw(1000000000000000000n, 18).toUnit()  // "1"
Amount.fromRaw(500n, 18).toUnit()                   // "0.0000000000000005"
Amount.fromRaw(100000000n, 6).toUnit()              // "100"
```

***

### toFormatted()

> **toFormatted**(`compressed?`): `string`

Defined in: [src/types/amount.ts:415](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/amount.ts#L415)

Returns a locale-formatted string with the token symbol for UI display.

Uses the device's preferred locale for number formatting, including
appropriate thousand separators and decimal notation.

#### Parameters

##### compressed?

`boolean` = `false`

If true, limits decimal places to 4 for compact display (default: false)

#### Returns

`string`

Formatted string with symbol (e.g., "1,500.50 ETH", "0.0001 STRK")

#### Example

```ts
const amount = Amount.parse("1500.123456", 18, "ETH");

amount.toFormatted()       // "1,500.123456 ETH" (full precision)
amount.toFormatted(true)   // "1,500.1235 ETH" (compressed to 4 decimals)

// Without symbol
const noSymbol = Amount.parse("100", 6);
noSymbol.toFormatted()     // "100" (no symbol appended)
```

***

### getDecimals()

> **getDecimals**(): `number`

Defined in: [src/types/amount.ts:440](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/amount.ts#L440)

Returns the number of decimal places for this amount.

Useful for validation when working with specific token contracts.

#### Returns

`number`

The number of decimal places (e.g., 18 for ETH, 6 for USDC)

#### Example

```ts
const ethAmount = Amount.parse("1.5", 18, "ETH");
console.log(ethAmount.getDecimals()); // 18

const usdcAmount = Amount.parse("100", USDC);
console.log(usdcAmount.getDecimals()); // 6
```

***

### getSymbol()

> **getSymbol**(): `string` \| `undefined`

Defined in: [src/types/amount.ts:460](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/amount.ts#L460)

Returns the token symbol for this amount, if set.

Useful for validation when working with specific token contracts.

#### Returns

`string` \| `undefined`

The token symbol (e.g., "ETH", "USDC") or undefined if not set

#### Example

```ts
const ethAmount = Amount.parse("1.5", 18, "ETH");
console.log(ethAmount.getSymbol()); // "ETH"

const noSymbol = Amount.parse("1.5", 18);
console.log(noSymbol.getSymbol()); // undefined
```

***

### add()

> **add**(`other`): `Amount`

Defined in: [src/types/amount.ts:529](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/amount.ts#L529)

Adds another Amount to this one.

Both amounts must have the same decimals and symbol (if set).

#### Parameters

##### other

`Amount`

The Amount to add

#### Returns

`Amount`

A new Amount representing the sum

#### Throws

Error if decimals don't match

#### Throws

Error if symbols don't match (when both are set)

#### Example

```ts
const a = Amount.parse("1.5", 18, "ETH");
const b = Amount.parse("2.5", 18, "ETH");
const sum = a.add(b);
console.log(sum.toUnit()); // "4"
```

***

### subtract()

> **subtract**(`other`): `Amount`

Defined in: [src/types/amount.ts:557](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/amount.ts#L557)

Subtracts another Amount from this one.

Both amounts must have the same decimals and symbol (if set).

#### Parameters

##### other

`Amount`

The Amount to subtract

#### Returns

`Amount`

A new Amount representing the difference

#### Throws

Error if decimals don't match

#### Throws

Error if symbols don't match (when both are set)

#### Throws

Error if the result would be negative (other > this)

#### Example

```ts
const a = Amount.parse("5", 18, "ETH");
const b = Amount.parse("2", 18, "ETH");
const diff = a.subtract(b);
console.log(diff.toUnit()); // "3"
```

***

### multiply()

> **multiply**(`multiplier`): `Amount`

Defined in: [src/types/amount.ts:587](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/amount.ts#L587)

Multiplies this Amount by a scalar value.

The scalar can be a string, number, or bigint. Fractional multipliers
are supported (e.g., "0.5" to halve the amount).

#### Parameters

##### multiplier

`BigNumberish`

The scalar value to multiply by

#### Returns

`Amount`

A new Amount representing the product

#### Throws

Error if multiplier is negative or invalid

#### Example

```ts
const amount = Amount.parse("10", 18, "ETH");

amount.multiply(2).toUnit();     // "20"
amount.multiply("0.5").toUnit(); // "5"
amount.multiply("1.5").toUnit(); // "15"
```

***

### divide()

> **divide**(`divisor`): `Amount`

Defined in: [src/types/amount.ts:633](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/amount.ts#L633)

Divides this Amount by a scalar value.

The scalar can be a string, number, or bigint. Fractional divisors
are supported (e.g., "0.5" to double the amount).

Note: Division uses integer arithmetic and rounds down (floor).

#### Parameters

##### divisor

`BigNumberish`

The scalar value to divide by

#### Returns

`Amount`

A new Amount representing the quotient

#### Throws

Error if divisor is zero

#### Throws

Error if divisor is negative or invalid

#### Example

```ts
const amount = Amount.parse("10", 18, "ETH");

amount.divide(2).toUnit();     // "5"
amount.divide("0.5").toUnit(); // "20"
amount.divide(4).toUnit();     // "2.5"
```

***

### eq()

> **eq**(`other`): `boolean`

Defined in: [src/types/amount.ts:687](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/amount.ts#L687)

Checks if this Amount is equal to another Amount.

Returns false if amounts have different decimals or symbols.

#### Parameters

##### other

`Amount`

The Amount to compare with

#### Returns

`boolean`

true if the amounts are equal and compatible, false otherwise

#### Example

```ts
const a = Amount.parse("1.5", 18, "ETH");
const b = Amount.parse("1.5", 18, "ETH");
const c = Amount.parse("2", 18, "ETH");
const usdc = Amount.parse("1.5", 6, "USDC");

a.eq(b);    // true
a.eq(c);    // false
a.eq(usdc); // false (incompatible)
```

***

### gt()

> **gt**(`other`): `boolean`

Defined in: [src/types/amount.ts:713](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/amount.ts#L713)

Checks if this Amount is greater than another Amount.

Returns false if amounts have different decimals or symbols.

#### Parameters

##### other

`Amount`

The Amount to compare with

#### Returns

`boolean`

true if this amount is greater and compatible, false otherwise

#### Example

```ts
const a = Amount.parse("2", 18, "ETH");
const b = Amount.parse("1", 18, "ETH");
const usdc = Amount.parse("1", 6, "USDC");

a.gt(b);    // true
b.gt(a);    // false
a.gt(usdc); // false (incompatible)
```

***

### gte()

> **gte**(`other`): `boolean`

Defined in: [src/types/amount.ts:738](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/amount.ts#L738)

Checks if this Amount is greater than or equal to another Amount.

Returns false if amounts have different decimals or symbols.

#### Parameters

##### other

`Amount`

The Amount to compare with

#### Returns

`boolean`

true if this amount is greater or equal and compatible, false otherwise

#### Example

```ts
const a = Amount.parse("2", 18, "ETH");
const b = Amount.parse("2", 18, "ETH");
const usdc = Amount.parse("2", 6, "USDC");

a.gte(b);    // true
a.gte(usdc); // false (incompatible)
```

***

### lt()

> **lt**(`other`): `boolean`

Defined in: [src/types/amount.ts:764](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/amount.ts#L764)

Checks if this Amount is less than another Amount.

Returns false if amounts have different decimals or symbols.

#### Parameters

##### other

`Amount`

The Amount to compare with

#### Returns

`boolean`

true if this amount is less and compatible, false otherwise

#### Example

```ts
const a = Amount.parse("1", 18, "ETH");
const b = Amount.parse("2", 18, "ETH");
const usdc = Amount.parse("2", 6, "USDC");

a.lt(b);    // true
b.lt(a);    // false
a.lt(usdc); // false (incompatible)
```

***

### lte()

> **lte**(`other`): `boolean`

Defined in: [src/types/amount.ts:789](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/amount.ts#L789)

Checks if this Amount is less than or equal to another Amount.

Returns false if amounts have different decimals or symbols.

#### Parameters

##### other

`Amount`

The Amount to compare with

#### Returns

`boolean`

true if this amount is less or equal and compatible, false otherwise

#### Example

```ts
const a = Amount.parse("2", 18, "ETH");
const b = Amount.parse("2", 18, "ETH");
const usdc = Amount.parse("2", 6, "USDC");

a.lte(b);    // true
a.lte(usdc); // false (incompatible)
```

***

### isZero()

> **isZero**(): `boolean`

Defined in: [src/types/amount.ts:807](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/amount.ts#L807)

Checks if this Amount is zero.

#### Returns

`boolean`

true if the amount is zero, false otherwise

#### Example

```ts
Amount.parse("0", 18, "ETH").isZero();   // true
Amount.parse("0.1", 18, "ETH").isZero(); // false
```

***

### isPositive()

> **isPositive**(): `boolean`

Defined in: [src/types/amount.ts:822](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/amount.ts#L822)

Checks if this Amount is positive (greater than zero).

#### Returns

`boolean`

true if the amount is positive, false otherwise

#### Example

```ts
Amount.parse("1", 18, "ETH").isPositive(); // true
Amount.parse("0", 18, "ETH").isPositive(); // false
```
