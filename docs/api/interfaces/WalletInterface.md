[**starkzap**](../README.md)

***

[starkzap](../globals.md) / WalletInterface

# Interface: WalletInterface

Defined in: [src/wallet/interface.ts:46](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/interface.ts#L46)

Interface for a connected Starknet wallet.

This interface defines the contract that all wallet implementations must follow,
allowing for different wallet providers (custom signers, Privy, etc.)
to be used interchangeably.

## Example

```ts
// Using with custom signer
const wallet = await sdk.connectWallet({
  account: { signer: new StarkSigner(privateKey) }
});

// All wallet implementations share WalletInterface
await wallet.execute([...]);
```

## Extended by

- [`CartridgeWalletInterface`](CartridgeWalletInterface.md)

## Properties

### address

> `readonly` **address**: [`Address`](../type-aliases/Address.md)

Defined in: [src/wallet/interface.ts:48](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/interface.ts#L48)

The wallet's Starknet address

## Methods

### isDeployed()

> **isDeployed**(): `Promise`\<`boolean`\>

Defined in: [src/wallet/interface.ts:53](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/interface.ts#L53)

Check if the account contract is deployed on-chain.

#### Returns

`Promise`\<`boolean`\>

***

### ensureReady()

> **ensureReady**(`options?`): `Promise`\<`void`\>

Defined in: [src/wallet/interface.ts:59](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/interface.ts#L59)

Ensure the wallet is ready for transactions.
Optionally deploys the account if needed.

#### Parameters

##### options?

[`EnsureReadyOptions`](EnsureReadyOptions.md)

#### Returns

`Promise`\<`void`\>

***

### deploy()

> **deploy**(`options?`): `Promise`\<[`Tx`](../classes/Tx.md)\>

Defined in: [src/wallet/interface.ts:67](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/interface.ts#L67)

Deploy the account contract.
Returns a Tx object to track the deployment.

#### Parameters

##### options?

[`DeployOptions`](DeployOptions.md)

#### Returns

`Promise`\<[`Tx`](../classes/Tx.md)\>

***

### execute()

> **execute**(`calls`, `options?`): `Promise`\<[`Tx`](../classes/Tx.md)\>

Defined in: [src/wallet/interface.ts:73](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/interface.ts#L73)

Execute one or more contract calls.
Returns a Tx object to track the transaction.

#### Parameters

##### calls

[`Call`](../type-aliases/Call.md)[]

##### options?

[`ExecuteOptions`](ExecuteOptions.md)

#### Returns

`Promise`\<[`Tx`](../classes/Tx.md)\>

***

### callContract()

> **callContract**(`call`): `Promise`\<`string`[]\>

Defined in: [src/wallet/interface.ts:81](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/interface.ts#L81)

Call a read-only contract entrypoint.

This executes an RPC `call` without sending a transaction.
Use this for view methods that don't mutate state.

#### Parameters

##### call

[`Call`](../type-aliases/Call.md)

#### Returns

`Promise`\<`string`[]\>

***

### tx()

> **tx**(): [`TxBuilder`](../classes/TxBuilder.md)

Defined in: [src/wallet/interface.ts:96](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/interface.ts#L96)

Create a transaction builder for batching multiple operations into a single transaction.

Chain operations fluently and call `.send()` to execute them atomically.

#### Returns

[`TxBuilder`](../classes/TxBuilder.md)

#### Example

```ts
const tx = await wallet.tx()
  .transfer(USDC, { to: alice, amount: Amount.parse("50", USDC) })
  .enterPool(poolAddress, Amount.parse("100", STRK))
  .send();
```

***

### getQuote()

> **getQuote**(`request`): `Promise`\<[`SwapQuote`](../type-aliases/SwapQuote.md)\>

Defined in: [src/wallet/interface.ts:104](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/interface.ts#L104)

Fetch a quote.

Set `request.provider` to a provider instance or provider id.
If omitted, uses the wallet default provider.

#### Parameters

##### request

[`SwapInput`](../type-aliases/SwapInput.md)

#### Returns

`Promise`\<[`SwapQuote`](../type-aliases/SwapQuote.md)\>

***

### swap()

> **swap**(`request`, `options?`): `Promise`\<[`Tx`](../classes/Tx.md)\>

Defined in: [src/wallet/interface.ts:112](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/interface.ts#L112)

Execute a swap.

Set `request.provider` to a provider instance or provider id.
If omitted, uses the wallet default provider.

#### Parameters

##### request

[`SwapInput`](../type-aliases/SwapInput.md)

##### options?

[`ExecuteOptions`](ExecuteOptions.md)

#### Returns

`Promise`\<[`Tx`](../classes/Tx.md)\>

***

### registerSwapProvider()

> **registerSwapProvider**(`provider`, `makeDefault?`): `void`

Defined in: [src/wallet/interface.ts:117](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/interface.ts#L117)

Register or replace a swap provider on this wallet.

#### Parameters

##### provider

[`SwapProvider`](../type-aliases/SwapProvider.md)

##### makeDefault?

`boolean`

#### Returns

`void`

***

### setDefaultSwapProvider()

> **setDefaultSwapProvider**(`providerId`): `void`

Defined in: [src/wallet/interface.ts:122](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/interface.ts#L122)

Set the default swap provider by id.

#### Parameters

##### providerId

`string`

#### Returns

`void`

***

### getSwapProvider()

> **getSwapProvider**(`providerId`): [`SwapProvider`](../type-aliases/SwapProvider.md)

Defined in: [src/wallet/interface.ts:127](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/interface.ts#L127)

Resolve a registered provider by id.

#### Parameters

##### providerId

`string`

#### Returns

[`SwapProvider`](../type-aliases/SwapProvider.md)

***

### getDefaultSwapProvider()

> **getDefaultSwapProvider**(): [`SwapProvider`](../type-aliases/SwapProvider.md)

Defined in: [src/wallet/interface.ts:132](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/interface.ts#L132)

Resolve the wallet default swap provider.

#### Returns

[`SwapProvider`](../type-aliases/SwapProvider.md)

***

### listSwapProviders()

> **listSwapProviders**(): `string`[]

Defined in: [src/wallet/interface.ts:137](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/interface.ts#L137)

List registered swap provider ids.

#### Returns

`string`[]

***

### signMessage()

> **signMessage**(`typedData`): `Promise`\<`Signature`\>

Defined in: [src/wallet/interface.ts:143](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/interface.ts#L143)

Sign a typed data message (EIP-712 style).
Returns the signature.

#### Parameters

##### typedData

`TypedData`

#### Returns

`Promise`\<`Signature`\>

***

### preflight()

> **preflight**(`options`): `Promise`\<[`PreflightResult`](../type-aliases/PreflightResult.md)\>

Defined in: [src/wallet/interface.ts:148](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/interface.ts#L148)

Simulate a transaction to check if it would succeed.

#### Parameters

##### options

[`PreflightOptions`](PreflightOptions.md)

#### Returns

`Promise`\<[`PreflightResult`](../type-aliases/PreflightResult.md)\>

***

### getAccount()

> **getAccount**(): `Account`

Defined in: [src/wallet/interface.ts:154](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/interface.ts#L154)

Get the underlying starknet.js Account instance.
Use this for advanced operations not covered by the SDK.

#### Returns

`Account`

***

### getProvider()

> **getProvider**(): [`RpcProvider`](RpcProvider.md)

Defined in: [src/wallet/interface.ts:160](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/interface.ts#L160)

Get the RPC provider instance.
Use this for read-only operations like balance queries.

#### Returns

[`RpcProvider`](RpcProvider.md)

***

### getChainId()

> **getChainId**(): [`ChainId`](../classes/ChainId.md)

Defined in: [src/wallet/interface.ts:165](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/interface.ts#L165)

Get the chain ID this wallet is connected to.

#### Returns

[`ChainId`](../classes/ChainId.md)

***

### getFeeMode()

> **getFeeMode**(): [`FeeMode`](../type-aliases/FeeMode.md)

Defined in: [src/wallet/interface.ts:170](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/interface.ts#L170)

Get the default fee mode for this wallet.

#### Returns

[`FeeMode`](../type-aliases/FeeMode.md)

***

### getClassHash()

> **getClassHash**(): `string`

Defined in: [src/wallet/interface.ts:175](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/interface.ts#L175)

Get the account class hash.

#### Returns

`string`

***

### estimateFee()

> **estimateFee**(`calls`): `Promise`\<`EstimateFeeResponseOverhead`\>

Defined in: [src/wallet/interface.ts:180](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/interface.ts#L180)

Estimate the fee for executing calls.

#### Parameters

##### calls

[`Call`](../type-aliases/Call.md)[]

#### Returns

`Promise`\<`EstimateFeeResponseOverhead`\>

***

### disconnect()

> **disconnect**(): `Promise`\<`void`\>

Defined in: [src/wallet/interface.ts:185](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/interface.ts#L185)

Disconnect the wallet and clean up resources.

#### Returns

`Promise`\<`void`\>

***

### erc20()

> **erc20**(`token`): [`Erc20`](../classes/Erc20.md)

Defined in: [src/wallet/interface.ts:194](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/interface.ts#L194)

Gets or creates an Erc20 instance for the given token.

#### Parameters

##### token

[`Token`](Token.md)

#### Returns

[`Erc20`](../classes/Erc20.md)

***

### transfer()

> **transfer**(`token`, `transfers`, `options?`): `Promise`\<[`Tx`](../classes/Tx.md)\>

Defined in: [src/wallet/interface.ts:199](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/interface.ts#L199)

Transfer ERC20 tokens to one or more recipients.

#### Parameters

##### token

[`Token`](Token.md)

##### transfers

`object`[]

##### options?

[`ExecuteOptions`](ExecuteOptions.md)

#### Returns

`Promise`\<[`Tx`](../classes/Tx.md)\>

***

### balanceOf()

> **balanceOf**(`token`): `Promise`\<[`Amount`](../classes/Amount.md)\>

Defined in: [src/wallet/interface.ts:208](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/interface.ts#L208)

Get the wallet's balance of an ERC20 token.

#### Parameters

##### token

[`Token`](Token.md)

#### Returns

`Promise`\<[`Amount`](../classes/Amount.md)\>

***

### staking()

> **staking**(`poolAddress`): `Promise`\<[`Staking`](../classes/Staking.md)\>

Defined in: [src/wallet/interface.ts:217](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/interface.ts#L217)

Get or create a Staking instance for a specific pool.

#### Parameters

##### poolAddress

[`Address`](../type-aliases/Address.md)

#### Returns

`Promise`\<[`Staking`](../classes/Staking.md)\>

***

### stakingInStaker()

> **stakingInStaker**(`stakerAddress`, `token`): `Promise`\<[`Staking`](../classes/Staking.md)\>

Defined in: [src/wallet/interface.ts:222](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/interface.ts#L222)

Get or create a Staking instance for a validator's pool.

#### Parameters

##### stakerAddress

[`Address`](../type-aliases/Address.md)

##### token

[`Token`](Token.md)

#### Returns

`Promise`\<[`Staking`](../classes/Staking.md)\>

***

### enterPool()

> **enterPool**(`poolAddress`, `amount`, `options?`): `Promise`\<[`Tx`](../classes/Tx.md)\>

Defined in: [src/wallet/interface.ts:227](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/interface.ts#L227)

Enter a delegation pool as a new member.

#### Parameters

##### poolAddress

[`Address`](../type-aliases/Address.md)

##### amount

[`Amount`](../classes/Amount.md)

##### options?

[`ExecuteOptions`](ExecuteOptions.md)

#### Returns

`Promise`\<[`Tx`](../classes/Tx.md)\>

***

### addToPool()

> **addToPool**(`poolAddress`, `amount`, `options?`): `Promise`\<[`Tx`](../classes/Tx.md)\>

Defined in: [src/wallet/interface.ts:236](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/interface.ts#L236)

Add more tokens to an existing stake in a pool.

#### Parameters

##### poolAddress

[`Address`](../type-aliases/Address.md)

##### amount

[`Amount`](../classes/Amount.md)

##### options?

[`ExecuteOptions`](ExecuteOptions.md)

#### Returns

`Promise`\<[`Tx`](../classes/Tx.md)\>

***

### stake()

> **stake**(`poolAddress`, `amount`, `options?`): `Promise`\<[`Tx`](../classes/Tx.md)\>

Defined in: [src/wallet/interface.ts:245](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/interface.ts#L245)

Stake in a pool, automatically entering or adding based on membership.

#### Parameters

##### poolAddress

[`Address`](../type-aliases/Address.md)

##### amount

[`Amount`](../classes/Amount.md)

##### options?

[`ExecuteOptions`](ExecuteOptions.md)

#### Returns

`Promise`\<[`Tx`](../classes/Tx.md)\>

***

### claimPoolRewards()

> **claimPoolRewards**(`poolAddress`, `options?`): `Promise`\<[`Tx`](../classes/Tx.md)\>

Defined in: [src/wallet/interface.ts:254](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/interface.ts#L254)

Claim accumulated staking rewards from a pool.

#### Parameters

##### poolAddress

[`Address`](../type-aliases/Address.md)

##### options?

[`ExecuteOptions`](ExecuteOptions.md)

#### Returns

`Promise`\<[`Tx`](../classes/Tx.md)\>

***

### exitPoolIntent()

> **exitPoolIntent**(`poolAddress`, `amount`, `options?`): `Promise`\<[`Tx`](../classes/Tx.md)\>

Defined in: [src/wallet/interface.ts:259](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/interface.ts#L259)

Initiate an exit from a delegation pool.

#### Parameters

##### poolAddress

[`Address`](../type-aliases/Address.md)

##### amount

[`Amount`](../classes/Amount.md)

##### options?

[`ExecuteOptions`](ExecuteOptions.md)

#### Returns

`Promise`\<[`Tx`](../classes/Tx.md)\>

***

### exitPool()

> **exitPool**(`poolAddress`, `options?`): `Promise`\<[`Tx`](../classes/Tx.md)\>

Defined in: [src/wallet/interface.ts:268](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/interface.ts#L268)

Complete the exit from a delegation pool.

#### Parameters

##### poolAddress

[`Address`](../type-aliases/Address.md)

##### options?

[`ExecuteOptions`](ExecuteOptions.md)

#### Returns

`Promise`\<[`Tx`](../classes/Tx.md)\>

***

### isPoolMember()

> **isPoolMember**(`poolAddress`): `Promise`\<`boolean`\>

Defined in: [src/wallet/interface.ts:273](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/interface.ts#L273)

Check if the wallet is a member of a delegation pool.

#### Parameters

##### poolAddress

[`Address`](../type-aliases/Address.md)

#### Returns

`Promise`\<`boolean`\>

***

### getPoolPosition()

> **getPoolPosition**(`poolAddress`): `Promise`\<[`PoolMember`](PoolMember.md) \| `null`\>

Defined in: [src/wallet/interface.ts:278](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/interface.ts#L278)

Get the wallet's staking position in a pool.

#### Parameters

##### poolAddress

[`Address`](../type-aliases/Address.md)

#### Returns

`Promise`\<[`PoolMember`](PoolMember.md) \| `null`\>

***

### getPoolCommission()

> **getPoolCommission**(`poolAddress`): `Promise`\<`number`\>

Defined in: [src/wallet/interface.ts:283](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/interface.ts#L283)

Get the validator's commission rate for a pool.

#### Parameters

##### poolAddress

[`Address`](../type-aliases/Address.md)

#### Returns

`Promise`\<`number`\>
