[**x**](../README.md)

---

[x](../globals.md) / OnboardPrivyResolveResult

# Interface: OnboardPrivyResolveResult

Defined in: src/types/onboard.ts:24

## Properties

### walletId

> **walletId**: `string`

Defined in: src/types/onboard.ts:25

---

### publicKey

> **publicKey**: `string`

Defined in: src/types/onboard.ts:26

---

### serverUrl?

> `optional` **serverUrl**: `string`

Defined in: src/types/onboard.ts:27

---

### rawSign()?

> `optional` **rawSign**: (`walletId`, `messageHash`) => `Promise`\<`string`\>

Defined in: src/types/onboard.ts:28

#### Parameters

##### walletId

`string`

##### messageHash

`string`

#### Returns

`Promise`\<`string`\>

---

### metadata?

> `optional` **metadata**: `Record`\<`string`, `unknown`\>

Defined in: src/types/onboard.ts:29
