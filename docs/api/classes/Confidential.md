[**starkzap**](../README.md)

***

[starkzap](../globals.md) / Confidential

# Class: Confidential

Defined in: src/confidential/confidential.ts:49

Wraps the Tongo confidential transaction protocol for use with StarkZap.

Each instance is bound to a single Tongo private key and contract.
Use the `populate*` methods to get `Call[]` arrays that can be passed
to `wallet.execute()` or added to a `TxBuilder` via `.add()`.

## Example

```ts
import { StarkZap, Confidential } from "starkzap";

const sdk = new StarkZap({ network: "mainnet" });
const wallet = await sdk.connectWallet({ ... });

const confidential = new Confidential({
  privateKey: tongoPrivateKey,
  contractAddress: TONGO_CONTRACT,
  provider: wallet.getProvider(),
});

// Fund confidential account
const tx = await wallet.tx()
  .add(...await confidential.populateFund({
    amount: 100n,
    sender: wallet.address,
  }))
  .send();

// Check balance
const state = await confidential.getState();
console.log(`Confidential balance: ${state.balance}`);
```

## Constructors

### Constructor

> **new Confidential**(`config`): `Confidential`

Defined in: src/confidential/confidential.ts:52

#### Parameters

##### config

[`ConfidentialConfig`](../interfaces/ConfidentialConfig.md)

#### Returns

`Confidential`

## Accessors

### tongoAddress

#### Get Signature

> **get** **tongoAddress**(): `TongoAddress`

Defined in: src/confidential/confidential.ts:61

The Tongo address (base58-encoded public key) for this account.

##### Returns

`TongoAddress`

## Methods

### getState()

> **getState**(): `Promise`\<[`ConfidentialState`](../interfaces/ConfidentialState.md)\>

Defined in: src/confidential/confidential.ts:71

Get the decrypted confidential account state.

Reads the on-chain encrypted balance and decrypts it locally
using the private key.

#### Returns

`Promise`\<[`ConfidentialState`](../interfaces/ConfidentialState.md)\>

***

### getNonce()

> **getNonce**(): `Promise`\<`bigint`\>

Defined in: src/confidential/confidential.ts:78

Get the account nonce.

#### Returns

`Promise`\<`bigint`\>

***

### erc20ToTongo()

> **erc20ToTongo**(`erc20Amount`): `Promise`\<`bigint`\>

Defined in: src/confidential/confidential.ts:85

Convert an ERC20 amount to tongo units using the on-chain rate.

#### Parameters

##### erc20Amount

`bigint`

#### Returns

`Promise`\<`bigint`\>

***

### tongoToErc20()

> **tongoToErc20**(`tongoAmount`): `Promise`\<`bigint`\>

Defined in: src/confidential/confidential.ts:92

Convert a tongo amount to ERC20 units using the on-chain rate.

#### Parameters

##### tongoAmount

`bigint`

#### Returns

`Promise`\<`bigint`\>

***

### populateFund()

> **populateFund**(`details`): `Promise`\<[`Call`](../type-aliases/Call.md)[]\>

Defined in: src/confidential/confidential.ts:102

Build the Call for funding this confidential account.

The caller is responsible for including an ERC20 approve call
before this in the transaction batch.

#### Parameters

##### details

[`ConfidentialFundDetails`](../interfaces/ConfidentialFundDetails.md)

#### Returns

`Promise`\<[`Call`](../type-aliases/Call.md)[]\>

***

### populateTransfer()

> **populateTransfer**(`details`): `Promise`\<[`Call`](../type-aliases/Call.md)[]\>

Defined in: src/confidential/confidential.ts:116

Build the Call for a confidential transfer.

Generates ZK proofs locally and returns the call to submit on-chain.

#### Parameters

##### details

[`ConfidentialTransferDetails`](../interfaces/ConfidentialTransferDetails.md)

#### Returns

`Promise`\<[`Call`](../type-aliases/Call.md)[]\>

***

### populateWithdraw()

> **populateWithdraw**(`details`): `Promise`\<[`Call`](../type-aliases/Call.md)[]\>

Defined in: src/confidential/confidential.ts:133

Build the Call for withdrawing from the confidential account.

Converts confidential balance back to public ERC20 tokens.

#### Parameters

##### details

[`ConfidentialWithdrawDetails`](../interfaces/ConfidentialWithdrawDetails.md)

#### Returns

`Promise`\<[`Call`](../type-aliases/Call.md)[]\>

***

### populateRagequit()

> **populateRagequit**(`details`): `Promise`\<[`Call`](../type-aliases/Call.md)[]\>

Defined in: src/confidential/confidential.ts:150

Build the Call for an emergency ragequit (full withdrawal).

Exits the entire confidential balance to a public address.

#### Parameters

##### details

[`ConfidentialRagequitDetails`](../interfaces/ConfidentialRagequitDetails.md)

#### Returns

`Promise`\<[`Call`](../type-aliases/Call.md)[]\>

***

### populateRollover()

> **populateRollover**(`details`): `Promise`\<[`Call`](../type-aliases/Call.md)[]\>

Defined in: src/confidential/confidential.ts:166

Build the Call for a rollover (activate pending balance).

Moves pending balance (from received transfers) into the active balance.

#### Parameters

##### details

[`ConfidentialRolloverDetails`](../interfaces/ConfidentialRolloverDetails.md)

#### Returns

`Promise`\<[`Call`](../type-aliases/Call.md)[]\>

***

### getTongoAccount()

> **getTongoAccount**(): `Account`

Defined in: src/confidential/confidential.ts:181

Access the underlying Tongo Account for advanced operations.

Use this for event reading, audit proofs, or other operations
not covered by the convenience methods.

#### Returns

`Account`
