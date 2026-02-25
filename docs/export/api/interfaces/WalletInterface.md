[**x**](../README.md)

---

[x](../globals.md) / WalletInterface

# Interface: WalletInterface

Defined in: [src/wallet/interface.ts:50](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/interface.ts#L50)

Interface for a connected Starknet wallet.

This interface defines the contract that all wallet implementations must follow,
allowing for different wallet providers (custom signers, Cartridge, etc.)
to be used interchangeably.

## Example

```ts
// Using with custom signer
const wallet = await sdk.connectWallet({
  account: { signer: new StarkSigner(privateKey) }
});

// Using with Cartridge
const wallet = await sdk.connectCartridge({
  policies: [{ target: "0x...", method: "transfer" }]
});

// Both implement WalletInterface
await wallet.execute([...]);
```

## Properties

### address

> `readonly` **address**: [`Address`](../type-aliases/Address.md)

Defined in: [src/wallet/interface.ts:52](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/interface.ts#L52)

The wallet's Starknet address

---

### activeErc20

> `readonly` **activeErc20**: [`Erc20`](../classes/Erc20.md)[]

Defined in: [src/wallet/interface.ts:149](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/interface.ts#L149)

Get all ERC20 instances that have been accessed by this wallet.

---

### activeStaking

> `readonly` **activeStaking**: [`Staking`](../classes/Staking.md)[]

Defined in: [src/wallet/interface.ts:177](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/interface.ts#L177)

Get all Staking instances that have been accessed by this wallet.

## Methods

### isDeployed()

> **isDeployed**(): `Promise`\<`boolean`\>

Defined in: [src/wallet/interface.ts:57](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/interface.ts#L57)

Check if the account contract is deployed on-chain.

#### Returns

`Promise`\<`boolean`\>

---

### ensureReady()

> **ensureReady**(`options?`): `Promise`\<`void`\>

Defined in: [src/wallet/interface.ts:63](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/interface.ts#L63)

Ensure the wallet is ready for transactions.
Optionally deploys the account if needed.

#### Parameters

##### options?

[`EnsureReadyOptions`](EnsureReadyOptions.md)

#### Returns

`Promise`\<`void`\>

---

### deploy()

> **deploy**(`options?`): `Promise`\<[`Tx`](../classes/Tx.md)\>

Defined in: [src/wallet/interface.ts:71](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/interface.ts#L71)

Deploy the account contract.
Returns a Tx object to track the deployment.

#### Parameters

##### options?

[`DeployOptions`](DeployOptions.md)

#### Returns

`Promise`\<[`Tx`](../classes/Tx.md)\>

---

### execute()

> **execute**(`calls`, `options?`): `Promise`\<[`Tx`](../classes/Tx.md)\>

Defined in: [src/wallet/interface.ts:77](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/interface.ts#L77)

Execute one or more contract calls.
Returns a Tx object to track the transaction.

#### Parameters

##### calls

[`Call`](../type-aliases/Call.md)[]

##### options?

[`ExecuteOptions`](ExecuteOptions.md)

#### Returns

`Promise`\<[`Tx`](../classes/Tx.md)\>

---

### tx()

> **tx**(): [`TxBuilder`](../classes/TxBuilder.md)

Defined in: [src/wallet/interface.ts:92](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/interface.ts#L92)

Create a transaction builder for batching multiple operations into a single transaction.

Chain operations fluently and call `.send()` to execute them atomically.

#### Returns

[`TxBuilder`](../classes/TxBuilder.md)

#### Example

```ts
const tx = await wallet
  .tx()
  .transfer(USDC, { to: alice, amount: Amount.parse("50", USDC) })
  .enterPool(poolAddress, Amount.parse("100", STRK))
  .send();
```

---

### signMessage()

> **signMessage**(`typedData`): `Promise`\<`Signature`\>

Defined in: [src/wallet/interface.ts:98](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/interface.ts#L98)

Sign a typed data message (EIP-712 style).
Returns the signature.

#### Parameters

##### typedData

`TypedData`

#### Returns

`Promise`\<`Signature`\>

---

### preflight()

> **preflight**(`options`): `Promise`\<[`PreflightResult`](../type-aliases/PreflightResult.md)\>

Defined in: [src/wallet/interface.ts:103](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/interface.ts#L103)

Simulate a transaction to check if it would succeed.

#### Parameters

##### options

[`PreflightOptions`](PreflightOptions.md)

#### Returns

`Promise`\<[`PreflightResult`](../type-aliases/PreflightResult.md)\>

---

### getAccount()

> **getAccount**(): `Account`

Defined in: [src/wallet/interface.ts:109](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/interface.ts#L109)

Get the underlying starknet.js Account instance.
Use this for advanced operations not covered by the SDK.

#### Returns

`Account`

---

### getProvider()

> **getProvider**(): `RpcProvider`

Defined in: [src/wallet/interface.ts:115](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/interface.ts#L115)

Get the RPC provider instance.
Use this for read-only operations like balance queries.

#### Returns

`RpcProvider`

---

### getChainId()

> **getChainId**(): [`ChainId`](../classes/ChainId.md)

Defined in: [src/wallet/interface.ts:120](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/interface.ts#L120)

Get the chain ID this wallet is connected to.

#### Returns

[`ChainId`](../classes/ChainId.md)

---

### getFeeMode()

> **getFeeMode**(): [`FeeMode`](../type-aliases/FeeMode.md)

Defined in: [src/wallet/interface.ts:125](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/interface.ts#L125)

Get the default fee mode for this wallet.

#### Returns

[`FeeMode`](../type-aliases/FeeMode.md)

---

### getClassHash()

> **getClassHash**(): `string`

Defined in: [src/wallet/interface.ts:130](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/interface.ts#L130)

Get the account class hash.

#### Returns

`string`

---

### estimateFee()

> **estimateFee**(`calls`): `Promise`\<`EstimateFeeResponseOverhead`\>

Defined in: [src/wallet/interface.ts:135](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/interface.ts#L135)

Estimate the fee for executing calls.

#### Parameters

##### calls

[`Call`](../type-aliases/Call.md)[]

#### Returns

`Promise`\<`EstimateFeeResponseOverhead`\>

---

### disconnect()

> **disconnect**(): `Promise`\<`void`\>

Defined in: [src/wallet/interface.ts:140](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/interface.ts#L140)

Disconnect the wallet and clean up resources.

#### Returns

`Promise`\<`void`\>

---

### erc20()

> **erc20**(`token`): [`Erc20`](../classes/Erc20.md)

Defined in: [src/wallet/interface.ts:154](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/interface.ts#L154)

Gets or creates an Erc20 instance for the given token.

#### Parameters

##### token

[`Token`](Token.md)

#### Returns

[`Erc20`](../classes/Erc20.md)

---

### transfer()

> **transfer**(`token`, `transfers`, `options?`): `Promise`\<[`Tx`](../classes/Tx.md)\>

Defined in: [src/wallet/interface.ts:159](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/interface.ts#L159)

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

---

### balanceOf()

> **balanceOf**(`token`): `Promise`\<[`Amount`](../classes/Amount.md)\>

Defined in: [src/wallet/interface.ts:168](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/interface.ts#L168)

Get the wallet's balance of an ERC20 token.

#### Parameters

##### token

[`Token`](Token.md)

#### Returns

`Promise`\<[`Amount`](../classes/Amount.md)\>

---

### staking()

> **staking**(`poolAddress`): `Promise`\<[`Staking`](../classes/Staking.md)\>

Defined in: [src/wallet/interface.ts:182](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/interface.ts#L182)

Get or create a Staking instance for a specific pool.

#### Parameters

##### poolAddress

[`Address`](../type-aliases/Address.md)

#### Returns

`Promise`\<[`Staking`](../classes/Staking.md)\>

---

### stakingInStaker()

> **stakingInStaker**(`stakerAddress`, `token`): `Promise`\<[`Staking`](../classes/Staking.md)\>

Defined in: [src/wallet/interface.ts:187](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/interface.ts#L187)

Get or create a Staking instance for a validator's pool.

#### Parameters

##### stakerAddress

[`Address`](../type-aliases/Address.md)

##### token

[`Token`](Token.md)

#### Returns

`Promise`\<[`Staking`](../classes/Staking.md)\>

---

### enterPool()

> **enterPool**(`poolAddress`, `amount`, `options?`): `Promise`\<[`Tx`](../classes/Tx.md)\>

Defined in: [src/wallet/interface.ts:192](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/interface.ts#L192)

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

---

### addToPool()

> **addToPool**(`poolAddress`, `amount`, `options?`): `Promise`\<[`Tx`](../classes/Tx.md)\>

Defined in: [src/wallet/interface.ts:201](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/interface.ts#L201)

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

---

### claimPoolRewards()

> **claimPoolRewards**(`poolAddress`, `options?`): `Promise`\<[`Tx`](../classes/Tx.md)\>

Defined in: [src/wallet/interface.ts:210](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/interface.ts#L210)

Claim accumulated staking rewards from a pool.

#### Parameters

##### poolAddress

[`Address`](../type-aliases/Address.md)

##### options?

[`ExecuteOptions`](ExecuteOptions.md)

#### Returns

`Promise`\<[`Tx`](../classes/Tx.md)\>

---

### exitPoolIntent()

> **exitPoolIntent**(`poolAddress`, `amount`, `options?`): `Promise`\<[`Tx`](../classes/Tx.md)\>

Defined in: [src/wallet/interface.ts:215](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/interface.ts#L215)

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

---

### exitPool()

> **exitPool**(`poolAddress`, `options?`): `Promise`\<[`Tx`](../classes/Tx.md)\>

Defined in: [src/wallet/interface.ts:224](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/interface.ts#L224)

Complete the exit from a delegation pool.

#### Parameters

##### poolAddress

[`Address`](../type-aliases/Address.md)

##### options?

[`ExecuteOptions`](ExecuteOptions.md)

#### Returns

`Promise`\<[`Tx`](../classes/Tx.md)\>

---

### isPoolMember()

> **isPoolMember**(`poolAddress`): `Promise`\<`boolean`\>

Defined in: [src/wallet/interface.ts:229](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/interface.ts#L229)

Check if the wallet is a member of a delegation pool.

#### Parameters

##### poolAddress

[`Address`](../type-aliases/Address.md)

#### Returns

`Promise`\<`boolean`\>

---

### getPoolPosition()

> **getPoolPosition**(`poolAddress`): `Promise`\<[`PoolMember`](PoolMember.md) \| `null`\>

Defined in: [src/wallet/interface.ts:234](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/interface.ts#L234)

Get the wallet's staking position in a pool.

#### Parameters

##### poolAddress

[`Address`](../type-aliases/Address.md)

#### Returns

`Promise`\<[`PoolMember`](PoolMember.md) \| `null`\>

---

### getPoolCommission()

> **getPoolCommission**(`poolAddress`): `Promise`\<`number`\>

Defined in: [src/wallet/interface.ts:239](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/interface.ts#L239)

Get the validator's commission rate for a pool.

#### Parameters

##### poolAddress

[`Address`](../type-aliases/Address.md)

#### Returns

`Promise`\<`number`\>
