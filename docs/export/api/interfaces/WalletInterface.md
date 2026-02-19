[**starkzap**](../README.md)

***

[starkzap](../globals.md) / WalletInterface

# Interface: WalletInterface

Defined in: [src/wallet/interface.ts:45](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/wallet/interface.ts#L45)

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

## Properties

### address

> `readonly` **address**: [`Address`](../type-aliases/Address.md)

Defined in: [src/wallet/interface.ts:47](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/wallet/interface.ts#L47)

The wallet's Starknet address

## Methods

### isDeployed()

> **isDeployed**(): `Promise`\<`boolean`\>

Defined in: [src/wallet/interface.ts:52](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/wallet/interface.ts#L52)

Check if the account contract is deployed on-chain.

#### Returns

`Promise`\<`boolean`\>

***

### ensureReady()

> **ensureReady**(`options?`): `Promise`\<`void`\>

Defined in: [src/wallet/interface.ts:58](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/wallet/interface.ts#L58)

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

Defined in: [src/wallet/interface.ts:66](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/wallet/interface.ts#L66)

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

Defined in: [src/wallet/interface.ts:72](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/wallet/interface.ts#L72)

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

Defined in: [src/wallet/interface.ts:80](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/wallet/interface.ts#L80)

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

Defined in: [src/wallet/interface.ts:95](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/wallet/interface.ts#L95)

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

### signMessage()

> **signMessage**(`typedData`): `Promise`\<`Signature`\>

Defined in: [src/wallet/interface.ts:101](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/wallet/interface.ts#L101)

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

Defined in: [src/wallet/interface.ts:106](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/wallet/interface.ts#L106)

Simulate a transaction to check if it would succeed.

#### Parameters

##### options

[`PreflightOptions`](PreflightOptions.md)

#### Returns

`Promise`\<[`PreflightResult`](../type-aliases/PreflightResult.md)\>

***

### getAccount()

> **getAccount**(): `Account`

Defined in: [src/wallet/interface.ts:112](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/wallet/interface.ts#L112)

Get the underlying starknet.js Account instance.
Use this for advanced operations not covered by the SDK.

#### Returns

`Account`

***

### getProvider()

> **getProvider**(): `RpcProvider`

Defined in: [src/wallet/interface.ts:118](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/wallet/interface.ts#L118)

Get the RPC provider instance.
Use this for read-only operations like balance queries.

#### Returns

`RpcProvider`

***

### getChainId()

> **getChainId**(): [`ChainId`](../classes/ChainId.md)

Defined in: [src/wallet/interface.ts:123](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/wallet/interface.ts#L123)

Get the chain ID this wallet is connected to.

#### Returns

[`ChainId`](../classes/ChainId.md)

***

### getFeeMode()

> **getFeeMode**(): [`FeeMode`](../type-aliases/FeeMode.md)

Defined in: [src/wallet/interface.ts:128](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/wallet/interface.ts#L128)

Get the default fee mode for this wallet.

#### Returns

[`FeeMode`](../type-aliases/FeeMode.md)

***

### getClassHash()

> **getClassHash**(): `string`

Defined in: [src/wallet/interface.ts:133](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/wallet/interface.ts#L133)

Get the account class hash.

#### Returns

`string`

***

### estimateFee()

> **estimateFee**(`calls`): `Promise`\<`EstimateFeeResponseOverhead`\>

Defined in: [src/wallet/interface.ts:138](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/wallet/interface.ts#L138)

Estimate the fee for executing calls.

#### Parameters

##### calls

[`Call`](../type-aliases/Call.md)[]

#### Returns

`Promise`\<`EstimateFeeResponseOverhead`\>

***

### disconnect()

> **disconnect**(): `Promise`\<`void`\>

Defined in: [src/wallet/interface.ts:143](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/wallet/interface.ts#L143)

Disconnect the wallet and clean up resources.

#### Returns

`Promise`\<`void`\>

***

### erc20()

> **erc20**(`token`): [`Erc20`](../classes/Erc20.md)

Defined in: [src/wallet/interface.ts:152](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/wallet/interface.ts#L152)

Gets or creates an Erc20 instance for the given token.

#### Parameters

##### token

[`Token`](Token.md)

#### Returns

[`Erc20`](../classes/Erc20.md)

***

### transfer()

> **transfer**(`token`, `transfers`, `options?`): `Promise`\<[`Tx`](../classes/Tx.md)\>

Defined in: [src/wallet/interface.ts:157](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/wallet/interface.ts#L157)

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

Defined in: [src/wallet/interface.ts:166](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/wallet/interface.ts#L166)

Get the wallet's balance of an ERC20 token.

#### Parameters

##### token

[`Token`](Token.md)

#### Returns

`Promise`\<[`Amount`](../classes/Amount.md)\>

***

### staking()

> **staking**(`poolAddress`): `Promise`\<[`Staking`](../classes/Staking.md)\>

Defined in: [src/wallet/interface.ts:175](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/wallet/interface.ts#L175)

Get or create a Staking instance for a specific pool.

#### Parameters

##### poolAddress

[`Address`](../type-aliases/Address.md)

#### Returns

`Promise`\<[`Staking`](../classes/Staking.md)\>

***

### stakingInStaker()

> **stakingInStaker**(`stakerAddress`, `token`): `Promise`\<[`Staking`](../classes/Staking.md)\>

Defined in: [src/wallet/interface.ts:180](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/wallet/interface.ts#L180)

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

Defined in: [src/wallet/interface.ts:185](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/wallet/interface.ts#L185)

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

Defined in: [src/wallet/interface.ts:194](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/wallet/interface.ts#L194)

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

Defined in: [src/wallet/interface.ts:203](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/wallet/interface.ts#L203)

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

Defined in: [src/wallet/interface.ts:212](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/wallet/interface.ts#L212)

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

Defined in: [src/wallet/interface.ts:217](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/wallet/interface.ts#L217)

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

Defined in: [src/wallet/interface.ts:226](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/wallet/interface.ts#L226)

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

Defined in: [src/wallet/interface.ts:231](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/wallet/interface.ts#L231)

Check if the wallet is a member of a delegation pool.

#### Parameters

##### poolAddress

[`Address`](../type-aliases/Address.md)

#### Returns

`Promise`\<`boolean`\>

***

### getPoolPosition()

> **getPoolPosition**(`poolAddress`): `Promise`\<[`PoolMember`](PoolMember.md) \| `null`\>

Defined in: [src/wallet/interface.ts:236](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/wallet/interface.ts#L236)

Get the wallet's staking position in a pool.

#### Parameters

##### poolAddress

[`Address`](../type-aliases/Address.md)

#### Returns

`Promise`\<[`PoolMember`](PoolMember.md) \| `null`\>

***

### getPoolCommission()

> **getPoolCommission**(`poolAddress`): `Promise`\<`number`\>

Defined in: [src/wallet/interface.ts:241](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/wallet/interface.ts#L241)

Get the validator's commission rate for a pool.

#### Parameters

##### poolAddress

[`Address`](../type-aliases/Address.md)

#### Returns

`Promise`\<`number`\>
