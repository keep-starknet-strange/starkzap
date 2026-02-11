[**x**](../README.md)

---

[x](../globals.md) / PaymasterOptions

# Interface: PaymasterOptions

Defined in: node_modules/starknet/dist/index.d.ts:976

## Extends

- `PaymasterRpcOptions`

## Properties

### nodeUrl?

> `optional` **nodeUrl**: `string`

Defined in: node_modules/starknet/dist/index.d.ts:979

#### Inherited from

`PaymasterRpcOptions.nodeUrl`

---

### default?

> `optional` **default**: `boolean`

Defined in: node_modules/starknet/dist/index.d.ts:980

#### Inherited from

`PaymasterRpcOptions.default`

---

### headers?

> `optional` **headers**: `object`

Defined in: node_modules/starknet/dist/index.d.ts:981

#### Inherited from

`PaymasterRpcOptions.headers`

---

### baseFetch()?

> `optional` **baseFetch**: (`input`, `init?`) => `Promise`\<`Response`\>

Defined in: node_modules/starknet/dist/index.d.ts:982

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Window/fetch)

#### Parameters

##### input

`URL` | `RequestInfo`

##### init?

`RequestInit`

#### Returns

`Promise`\<`Response`\>

#### Inherited from

`PaymasterRpcOptions.baseFetch`
