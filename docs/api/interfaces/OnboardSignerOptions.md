[**x**](../README.md)

---

[x](../globals.md) / OnboardSignerOptions

# Interface: OnboardSignerOptions

Defined in: src/types/onboard.ts:32

## Extends

- [`OnboardBaseOptions`](OnboardBaseOptions.md)

## Properties

### feeMode?

> `optional` **feeMode**: [`FeeMode`](../type-aliases/FeeMode.md)

Defined in: src/types/onboard.ts:18

#### Inherited from

[`OnboardBaseOptions`](OnboardBaseOptions.md).[`feeMode`](OnboardBaseOptions.md#feemode)

---

### timeBounds?

> `optional` **timeBounds**: [`PaymasterTimeBounds`](PaymasterTimeBounds.md)

Defined in: src/types/onboard.ts:19

#### Inherited from

[`OnboardBaseOptions`](OnboardBaseOptions.md).[`timeBounds`](OnboardBaseOptions.md#timebounds)

---

### deploy?

> `optional` **deploy**: [`DeployMode`](../type-aliases/DeployMode.md)

Defined in: src/types/onboard.ts:20

#### Inherited from

[`OnboardBaseOptions`](OnboardBaseOptions.md).[`deploy`](OnboardBaseOptions.md#deploy)

---

### onProgress()?

> `optional` **onProgress**: (`event`) => `void`

Defined in: src/types/onboard.ts:21

#### Parameters

##### event

[`ProgressEvent`](ProgressEvent.md)

#### Returns

`void`

#### Inherited from

[`OnboardBaseOptions`](OnboardBaseOptions.md).[`onProgress`](OnboardBaseOptions.md#onprogress)

---

### strategy

> **strategy**: `"signer"`

Defined in: src/types/onboard.ts:33

---

### account

> **account**: [`AccountConfig`](AccountConfig.md)

Defined in: src/types/onboard.ts:34

---

### accountPreset?

> `optional` **accountPreset**: [`AccountClassConfig`](AccountClassConfig.md) \| `"devnet"` \| `"openzeppelin"` \| `"argent"` \| `"braavos"` \| `"argentXV050"`

Defined in: src/types/onboard.ts:35
