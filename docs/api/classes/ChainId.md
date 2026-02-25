[**x**](../README.md)

---

[x](../globals.md) / ChainId

# Class: ChainId

Defined in: [src/types/config.ts:38](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/config.ts#L38)

Represents a Starknet chain identifier.

Provides helpers for chain detection and conversion between
literal strings and felt252 on-chain representations.

## Example

```ts
// Use static constants (recommended)
const chain = ChainId.MAINNET;
const chain = ChainId.SEPOLIA;

// Create from a literal
const chain = ChainId.from("SN_MAIN");

// Create from an on-chain felt252 value
const chain = ChainId.fromFelt252(chainIdHex);

// Check which chain
if (chain.isMainnet()) { ... }
if (chain.isSepolia()) { ... }
```

## Constructors

### Constructor

> **new ChainId**(`value`): `ChainId`

Defined in: [src/types/config.ts:39](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/config.ts#L39)

#### Parameters

##### value

[`ChainIdLiteral`](../type-aliases/ChainIdLiteral.md)

#### Returns

`ChainId`

## Properties

### value

> `readonly` **value**: [`ChainIdLiteral`](../type-aliases/ChainIdLiteral.md)

Defined in: [src/types/config.ts:39](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/config.ts#L39)

---

### MAINNET

> `readonly` `static` **MAINNET**: `ChainId`

Defined in: [src/types/config.ts:67](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/config.ts#L67)

Pre-built instance for Starknet Mainnet.

---

### SEPOLIA

> `readonly` `static` **SEPOLIA**: `ChainId`

Defined in: [src/types/config.ts:70](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/config.ts#L70)

Pre-built instance for Starknet Sepolia testnet.

## Methods

### isMainnet()

> **isMainnet**(): `boolean`

Defined in: [src/types/config.ts:42](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/config.ts#L42)

Returns `true` if this is Starknet Mainnet (`SN_MAIN`).

#### Returns

`boolean`

---

### isSepolia()

> **isSepolia**(): `boolean`

Defined in: [src/types/config.ts:47](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/config.ts#L47)

Returns `true` if this is Starknet Sepolia testnet (`SN_SEPOLIA`).

#### Returns

`boolean`

---

### toFelt252()

> **toFelt252**(): `string`

Defined in: [src/types/config.ts:55](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/config.ts#L55)

Returns the felt252 (hex) representation used on-chain.

#### Returns

`string`

#### Throws

Error if the chain ID is not recognized

---

### toLiteral()

> **toLiteral**(): [`ChainIdLiteral`](../type-aliases/ChainIdLiteral.md)

Defined in: [src/types/config.ts:62](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/config.ts#L62)

Returns the literal string value (e.g. `"SN_MAIN"` or `"SN_SEPOLIA"`).

#### Returns

[`ChainIdLiteral`](../type-aliases/ChainIdLiteral.md)

---

### from()

> `static` **from**(`literal`): `ChainId`

Defined in: [src/types/config.ts:76](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/config.ts#L76)

Create a ChainId from a literal string.

#### Parameters

##### literal

[`ChainIdLiteral`](../type-aliases/ChainIdLiteral.md)

`"SN_MAIN"` or `"SN_SEPOLIA"`

#### Returns

`ChainId`

---

### fromFelt252()

> `static` **fromFelt252**(`felt252`): `ChainId`

Defined in: [src/types/config.ts:85](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/config.ts#L85)

Create a ChainId from an on-chain felt252 hex value.

#### Parameters

##### felt252

`string`

The hex-encoded chain ID (e.g. from `provider.getChainId()`)

#### Returns

`ChainId`

#### Throws

Error if the decoded value is not a supported chain
