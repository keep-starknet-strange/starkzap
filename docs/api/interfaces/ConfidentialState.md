[**starkzap**](../README.md)

***

[starkzap](../globals.md) / ConfidentialState

# Interface: ConfidentialState

Defined in: src/confidential/types.ts:65

Decrypted confidential account state.

## Properties

### balance

> **balance**: `bigint`

Defined in: src/confidential/types.ts:67

Active (spendable) balance.

***

### pending

> **pending**: `bigint`

Defined in: src/confidential/types.ts:69

Pending balance (needs rollover to become active).

***

### nonce

> **nonce**: `bigint`

Defined in: src/confidential/types.ts:71

Account nonce.
