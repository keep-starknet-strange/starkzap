[**x**](../README.md)

---

[x](../globals.md) / AccountProvider

# Class: AccountProvider

Defined in: [src/wallet/accounts/provider.ts:36](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/accounts/provider.ts#L36)

Account provider that combines a signer with an account class configuration.

Computes and caches the Starknet address from the signer's public key
and the account class constructor. This is the bridge between a
[SignerInterface](../interfaces/SignerInterface.md) and a deployed (or counterfactual) account contract.

## Example

```ts
import { AccountProvider, StarkSigner, ArgentPreset } from "x";

const provider = new AccountProvider(new StarkSigner(privateKey), ArgentPreset);

const address = await provider.getAddress();
const publicKey = await provider.getPublicKey();
```

## Constructors

### Constructor

> **new AccountProvider**(`signer`, `accountClass?`): `AccountProvider`

Defined in: [src/wallet/accounts/provider.ts:46](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/accounts/provider.ts#L46)

#### Parameters

##### signer

[`SignerInterface`](../interfaces/SignerInterface.md)

The signer implementation for signing operations

##### accountClass?

[`AccountClassConfig`](../interfaces/AccountClassConfig.md)

Account class configuration (default: [OpenZeppelinPreset](../variables/OpenZeppelinPreset.md))

#### Returns

`AccountProvider`

## Methods

### getAddress()

> **getAddress**(): `Promise`\<[`Address`](../type-aliases/Address.md)\>

Defined in: [src/wallet/accounts/provider.ts:59](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/accounts/provider.ts#L59)

Compute and return the counterfactual address for this account.

The address is derived from the signer's public key, the account class
hash, and the constructor calldata. Cached after first computation.

#### Returns

`Promise`\<[`Address`](../type-aliases/Address.md)\>

The Starknet address for this account

---

### getPublicKey()

> **getPublicKey**(): `Promise`\<`string`\>

Defined in: [src/wallet/accounts/provider.ts:88](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/accounts/provider.ts#L88)

Get the public key from the underlying signer. Cached after first call.

#### Returns

`Promise`\<`string`\>

The public key as a hex string

---

### getSigner()

> **getSigner**(): [`SignerInterface`](../interfaces/SignerInterface.md)

Defined in: [src/wallet/accounts/provider.ts:98](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/accounts/provider.ts#L98)

Get the underlying signer instance.

#### Returns

[`SignerInterface`](../interfaces/SignerInterface.md)

---

### getClassHash()

> **getClassHash**(): `string`

Defined in: [src/wallet/accounts/provider.ts:103](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/accounts/provider.ts#L103)

Get the account contract class hash.

#### Returns

`string`

---

### getConstructorCalldata()

> **getConstructorCalldata**(`publicKey`): `Calldata`

Defined in: [src/wallet/accounts/provider.ts:108](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/accounts/provider.ts#L108)

Build the constructor calldata from the given public key.

#### Parameters

##### publicKey

`string`

#### Returns

`Calldata`

---

### getSalt()

> **getSalt**(`publicKey`): `string`

Defined in: [src/wallet/accounts/provider.ts:113](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/accounts/provider.ts#L113)

Compute the address salt from the given public key.

#### Parameters

##### publicKey

`string`

#### Returns

`string`

---

### getDeploymentData()

> **getDeploymentData**(): `Promise`\<`ACCOUNT_DEPLOYMENT_DATA`\>

Defined in: [src/wallet/accounts/provider.ts:122](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/accounts/provider.ts#L122)

Get deployment data for paymaster-sponsored deployment.

#### Returns

`Promise`\<`ACCOUNT_DEPLOYMENT_DATA`\>
