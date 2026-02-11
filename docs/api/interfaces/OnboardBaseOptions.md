[**x**](../README.md)

---

[x](../globals.md) / OnboardBaseOptions

# Interface: OnboardBaseOptions

Defined in: src/types/onboard.ts:17

## Extended by

- [`OnboardSignerOptions`](OnboardSignerOptions.md)
- [`OnboardPrivyOptions`](OnboardPrivyOptions.md)
- [`OnboardCartridgeOptions`](OnboardCartridgeOptions.md)
- [`OnboardWebAuthnOptions`](OnboardWebAuthnOptions.md)

## Properties

### feeMode?

> `optional` **feeMode**: [`FeeMode`](../type-aliases/FeeMode.md)

Defined in: src/types/onboard.ts:18

---

### timeBounds?

> `optional` **timeBounds**: [`PaymasterTimeBounds`](PaymasterTimeBounds.md)

Defined in: src/types/onboard.ts:19

---

### deploy?

> `optional` **deploy**: [`DeployMode`](../type-aliases/DeployMode.md)

Defined in: src/types/onboard.ts:20

---

### onProgress()?

> `optional` **onProgress**: (`event`) => `void`

Defined in: src/types/onboard.ts:21

#### Parameters

##### event

[`ProgressEvent`](ProgressEvent.md)

#### Returns

`void`
