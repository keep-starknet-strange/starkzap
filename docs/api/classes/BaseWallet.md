[**starkzap**](../README.md)

***

[starkzap](../globals.md) / BaseWallet

# Abstract Class: BaseWallet

Defined in: [src/wallet/base.ts:60](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L60)

Abstract base class for wallet implementations.

Provides shared functionality, ERC20 token operations, and staking operations
for all wallet types. Child classes (e.g., `Wallet`) must
implement the abstract methods to provide wallet-specific behavior.

## Remarks

This class implements the delegation pattern for ERC20 and Staking operations,
caching instances per token/pool address for efficient reuse.

## Example

```ts
class CustomWallet extends BaseWallet {
  constructor(address: Address, private account: Account) {
    super(address, undefined);
  }

  async isDeployed(): Promise<boolean> {
    // Custom implementation
  }
  // ... implement other abstract methods
}
```

## Extended by

- [`Wallet`](Wallet.md)

## Implements

- [`WalletInterface`](../interfaces/WalletInterface.md)

## Constructors

### Constructor

> `protected` **new BaseWallet**(`address`, `stakingConfig`, `defaultSwapProvider?`): `BaseWallet`

Defined in: [src/wallet/base.ts:86](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L86)

Creates a new BaseWallet instance.

#### Parameters

##### address

[`Address`](../type-aliases/Address.md)

The Starknet address of this wallet

##### stakingConfig

Optional staking configuration for staking operations

[`StakingConfig`](../interfaces/StakingConfig.md) | `undefined`

##### defaultSwapProvider?

[`SwapProvider`](../type-aliases/SwapProvider.md)

Optional default swap provider used by `getQuote(request)` and `swap(request)`

#### Returns

`BaseWallet`

## Properties

### address

> `readonly` **address**: [`Address`](../type-aliases/Address.md)

Defined in: [src/wallet/base.ts:62](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L62)

The wallet's Starknet address

#### Implementation of

[`WalletInterface`](../interfaces/WalletInterface.md).[`address`](../interfaces/WalletInterface.md#address)

## Methods

### isDeployed()

> `abstract` **isDeployed**(): `Promise`\<`boolean`\>

Defined in: [src/wallet/base.ts:107](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L107)

Check if the account contract is deployed on-chain.

#### Returns

`Promise`\<`boolean`\>

#### Implementation of

[`WalletInterface`](../interfaces/WalletInterface.md).[`isDeployed`](../interfaces/WalletInterface.md#isdeployed)

***

### ensureReady()

> `abstract` **ensureReady**(`options?`): `Promise`\<`void`\>

Defined in: [src/wallet/base.ts:110](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L110)

Ensure the wallet is ready for transactions.
Optionally deploys the account if needed.

#### Parameters

##### options?

[`EnsureReadyOptions`](../interfaces/EnsureReadyOptions.md)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`WalletInterface`](../interfaces/WalletInterface.md).[`ensureReady`](../interfaces/WalletInterface.md#ensureready)

***

### deploy()

> `abstract` **deploy**(`options?`): `Promise`\<[`Tx`](Tx.md)\>

Defined in: [src/wallet/base.ts:113](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L113)

Deploy the account contract.
Returns a Tx object to track the deployment.

#### Parameters

##### options?

[`DeployOptions`](../interfaces/DeployOptions.md)

#### Returns

`Promise`\<[`Tx`](Tx.md)\>

#### Implementation of

[`WalletInterface`](../interfaces/WalletInterface.md).[`deploy`](../interfaces/WalletInterface.md#deploy)

***

### execute()

> `abstract` **execute**(`calls`, `options?`): `Promise`\<[`Tx`](Tx.md)\>

Defined in: [src/wallet/base.ts:116](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L116)

Execute one or more contract calls.
Returns a Tx object to track the transaction.

#### Parameters

##### calls

[`Call`](../type-aliases/Call.md)[]

##### options?

[`ExecuteOptions`](../interfaces/ExecuteOptions.md)

#### Returns

`Promise`\<[`Tx`](Tx.md)\>

#### Implementation of

[`WalletInterface`](../interfaces/WalletInterface.md).[`execute`](../interfaces/WalletInterface.md#execute)

***

### callContract()

> **callContract**(`call`): `Promise`\<`string`[]\>

Defined in: [src/wallet/base.ts:119](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L119)

Call a read-only contract entrypoint.

This executes an RPC `call` without sending a transaction.
Use this for view methods that don't mutate state.

#### Parameters

##### call

[`Call`](../type-aliases/Call.md)

#### Returns

`Promise`\<`string`[]\>

#### Implementation of

[`WalletInterface`](../interfaces/WalletInterface.md).[`callContract`](../interfaces/WalletInterface.md#callcontract)

***

### signMessage()

> `abstract` **signMessage**(`typedData`): `Promise`\<`Signature`\>

Defined in: [src/wallet/base.ts:124](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L124)

Sign a typed data message (EIP-712 style).
Returns the signature.

#### Parameters

##### typedData

`TypedData`

#### Returns

`Promise`\<`Signature`\>

#### Implementation of

[`WalletInterface`](../interfaces/WalletInterface.md).[`signMessage`](../interfaces/WalletInterface.md#signmessage)

***

### preflight()

> `abstract` **preflight**(`options`): `Promise`\<[`PreflightResult`](../type-aliases/PreflightResult.md)\>

Defined in: [src/wallet/base.ts:127](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L127)

Simulate a transaction to check if it would succeed.

#### Parameters

##### options

[`PreflightOptions`](../interfaces/PreflightOptions.md)

#### Returns

`Promise`\<[`PreflightResult`](../type-aliases/PreflightResult.md)\>

#### Implementation of

[`WalletInterface`](../interfaces/WalletInterface.md).[`preflight`](../interfaces/WalletInterface.md#preflight)

***

### getAccount()

> `abstract` **getAccount**(): `Account`

Defined in: [src/wallet/base.ts:130](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L130)

Get the underlying starknet.js Account instance.
Use this for advanced operations not covered by the SDK.

#### Returns

`Account`

#### Implementation of

[`WalletInterface`](../interfaces/WalletInterface.md).[`getAccount`](../interfaces/WalletInterface.md#getaccount)

***

### getProvider()

> `abstract` **getProvider**(): [`RpcProvider`](../interfaces/RpcProvider.md)

Defined in: [src/wallet/base.ts:133](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L133)

Get the RPC provider instance.
Use this for read-only operations like balance queries.

#### Returns

[`RpcProvider`](../interfaces/RpcProvider.md)

#### Implementation of

[`WalletInterface`](../interfaces/WalletInterface.md).[`getProvider`](../interfaces/WalletInterface.md#getprovider)

***

### getChainId()

> `abstract` **getChainId**(): [`ChainId`](ChainId.md)

Defined in: [src/wallet/base.ts:136](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L136)

Get the chain ID this wallet is connected to.

#### Returns

[`ChainId`](ChainId.md)

#### Implementation of

[`WalletInterface`](../interfaces/WalletInterface.md).[`getChainId`](../interfaces/WalletInterface.md#getchainid)

***

### getFeeMode()

> `abstract` **getFeeMode**(): [`FeeMode`](../type-aliases/FeeMode.md)

Defined in: [src/wallet/base.ts:139](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L139)

Get the default fee mode for this wallet.

#### Returns

[`FeeMode`](../type-aliases/FeeMode.md)

#### Implementation of

[`WalletInterface`](../interfaces/WalletInterface.md).[`getFeeMode`](../interfaces/WalletInterface.md#getfeemode)

***

### getClassHash()

> `abstract` **getClassHash**(): `string`

Defined in: [src/wallet/base.ts:142](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L142)

Get the account class hash.

#### Returns

`string`

#### Implementation of

[`WalletInterface`](../interfaces/WalletInterface.md).[`getClassHash`](../interfaces/WalletInterface.md#getclasshash)

***

### estimateFee()

> `abstract` **estimateFee**(`calls`): `Promise`\<`EstimateFeeResponseOverhead`\>

Defined in: [src/wallet/base.ts:145](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L145)

Estimate the fee for executing calls.

#### Parameters

##### calls

[`Call`](../type-aliases/Call.md)[]

#### Returns

`Promise`\<`EstimateFeeResponseOverhead`\>

#### Implementation of

[`WalletInterface`](../interfaces/WalletInterface.md).[`estimateFee`](../interfaces/WalletInterface.md#estimatefee)

***

### disconnect()

> `abstract` **disconnect**(): `Promise`\<`void`\>

Defined in: [src/wallet/base.ts:148](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L148)

Disconnect the wallet and clean up resources.

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`WalletInterface`](../interfaces/WalletInterface.md).[`disconnect`](../interfaces/WalletInterface.md#disconnect)

***

### tx()

> **tx**(): [`TxBuilder`](TxBuilder.md)

Defined in: [src/wallet/base.ts:168](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L168)

Create a transaction builder for batching multiple operations into a single transaction.

#### Returns

[`TxBuilder`](TxBuilder.md)

A new TxBuilder instance bound to this wallet

#### Example

```ts
const tx = await wallet.tx()
  .transfer(USDC, { to: alice, amount: Amount.parse("50", USDC) })
  .enterPool(poolAddress, Amount.parse("100", STRK))
  .send();
await tx.wait();
```

#### Implementation of

[`WalletInterface`](../interfaces/WalletInterface.md).[`tx`](../interfaces/WalletInterface.md#tx)

***

### getQuote()

> **getQuote**(`request`): `Promise`\<[`SwapQuote`](../type-aliases/SwapQuote.md)\>

Defined in: [src/wallet/base.ts:178](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L178)

Fetch a quote.

Set `request.provider` to a provider instance or provider id.
If omitted, uses the wallet default provider.

#### Parameters

##### request

[`SwapInput`](../type-aliases/SwapInput.md)

#### Returns

`Promise`\<[`SwapQuote`](../type-aliases/SwapQuote.md)\>

#### Implementation of

[`WalletInterface`](../interfaces/WalletInterface.md).[`getQuote`](../interfaces/WalletInterface.md#getquote)

***

### swap()

> **swap**(`request`, `options?`): `Promise`\<[`Tx`](Tx.md)\>

Defined in: [src/wallet/base.ts:193](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L193)

Execute a swap.

Set `request.provider` to a provider instance or provider id.
If omitted, uses the wallet default provider.

#### Parameters

##### request

[`SwapInput`](../type-aliases/SwapInput.md)

##### options?

[`ExecuteOptions`](../interfaces/ExecuteOptions.md)

#### Returns

`Promise`\<[`Tx`](Tx.md)\>

#### Implementation of

[`WalletInterface`](../interfaces/WalletInterface.md).[`swap`](../interfaces/WalletInterface.md#swap)

***

### registerSwapProvider()

> **registerSwapProvider**(`provider`, `makeDefault?`): `void`

Defined in: [src/wallet/base.ts:204](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L204)

Register or replace a swap provider on this wallet.

#### Parameters

##### provider

[`SwapProvider`](../type-aliases/SwapProvider.md)

##### makeDefault?

`boolean` = `false`

#### Returns

`void`

#### Implementation of

[`WalletInterface`](../interfaces/WalletInterface.md).[`registerSwapProvider`](../interfaces/WalletInterface.md#registerswapprovider)

***

### setDefaultSwapProvider()

> **setDefaultSwapProvider**(`providerId`): `void`

Defined in: [src/wallet/base.ts:211](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L211)

Set the default swap provider by id.

#### Parameters

##### providerId

`string`

#### Returns

`void`

#### Implementation of

[`WalletInterface`](../interfaces/WalletInterface.md).[`setDefaultSwapProvider`](../interfaces/WalletInterface.md#setdefaultswapprovider)

***

### getSwapProvider()

> **getSwapProvider**(`providerId`): [`SwapProvider`](../type-aliases/SwapProvider.md)

Defined in: [src/wallet/base.ts:220](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L220)

Resolve a registered provider by id.

#### Parameters

##### providerId

`string`

#### Returns

[`SwapProvider`](../type-aliases/SwapProvider.md)

#### Implementation of

[`WalletInterface`](../interfaces/WalletInterface.md).[`getSwapProvider`](../interfaces/WalletInterface.md#getswapprovider)

***

### listSwapProviders()

> **listSwapProviders**(): `string`[]

Defined in: [src/wallet/base.ts:230](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L230)

List registered swap provider ids.

#### Returns

`string`[]

#### Implementation of

[`WalletInterface`](../interfaces/WalletInterface.md).[`listSwapProviders`](../interfaces/WalletInterface.md#listswapproviders)

***

### getDefaultSwapProvider()

> **getDefaultSwapProvider**(): [`SwapProvider`](../type-aliases/SwapProvider.md)

Defined in: [src/wallet/base.ts:234](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L234)

Resolve the wallet default swap provider.

#### Returns

[`SwapProvider`](../type-aliases/SwapProvider.md)

#### Implementation of

[`WalletInterface`](../interfaces/WalletInterface.md).[`getDefaultSwapProvider`](../interfaces/WalletInterface.md#getdefaultswapprovider)

***

### clearCaches()

> `protected` **clearCaches**(): `void`

Defined in: [src/wallet/base.ts:241](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L241)

#### Returns

`void`

***

### erc20()

> **erc20**(`token`): [`Erc20`](Erc20.md)

Defined in: [src/wallet/base.ts:277](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L277)

Gets or creates an Erc20 instance for the given token.

Uses a cache to avoid creating multiple instances for the same token,
improving performance when performing multiple operations on the same token.

#### Parameters

##### token

[`Token`](../interfaces/Token.md)

The token to get an Erc20 instance for

#### Returns

[`Erc20`](Erc20.md)

The cached or newly created Erc20 instance

#### Implementation of

[`WalletInterface`](../interfaces/WalletInterface.md).[`erc20`](../interfaces/WalletInterface.md#erc20)

***

### transfer()

> **transfer**(`token`, `transfers`, `options?`): `Promise`\<[`Tx`](Tx.md)\>

Defined in: [src/wallet/base.ts:316](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L316)

Transfer ERC20 tokens to one or more recipients.

Multiple transfers can be batched into a single transaction for gas efficiency.
The Amount for each transfer must match the token's decimals and symbol.

#### Parameters

##### token

[`Token`](../interfaces/Token.md)

The ERC20 token to transfer

##### transfers

`object`[]

Array of transfer objects containing:
  - `to`: The recipient's Starknet address
  - `amount`: The Amount to transfer

##### options?

[`ExecuteOptions`](../interfaces/ExecuteOptions.md)

Optional execution options (e.g., gas settings)

#### Returns

`Promise`\<[`Tx`](Tx.md)\>

A Tx object to track the transaction

#### Throws

Error if any amount's decimals or symbol don't match the token

#### Example

```ts
const tx = await wallet.transfer(USDC, [
  { to: alice, amount: Amount.parse("50", USDC) },
  { to: bob, amount: Amount.parse("25", USDC) },
]);
await tx.wait();
```

#### See

[Erc20#transfer](Erc20.md#transfer)

#### Implementation of

[`WalletInterface`](../interfaces/WalletInterface.md).[`transfer`](../interfaces/WalletInterface.md#transfer)

***

### balanceOf()

> **balanceOf**(`token`): `Promise`\<[`Amount`](Amount.md)\>

Defined in: [src/wallet/base.ts:345](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L345)

Get the wallet's balance of an ERC20 token.

The returned Amount includes the token's decimals and symbol,
allowing for easy formatting and display.

#### Parameters

##### token

[`Token`](../interfaces/Token.md)

The ERC20 token to check the balance of

#### Returns

`Promise`\<[`Amount`](Amount.md)\>

An Amount representing the token balance

#### Example

```ts
const balance = await wallet.balanceOf(USDC);
console.log(balance.toFormatted()); // "150.5 USDC"
```

#### See

[Erc20#balanceOf](Erc20.md#balanceof)

#### Implementation of

[`WalletInterface`](../interfaces/WalletInterface.md).[`balanceOf`](../interfaces/WalletInterface.md#balanceof)

***

### enterPool()

> **enterPool**(`poolAddress`, `amount`, `options?`): `Promise`\<[`Tx`](Tx.md)\>

Defined in: [src/wallet/base.ts:375](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L375)

Enter a delegation pool as a new member.

Approves the token transfer and stakes the specified amount in the pool.
The wallet must not already be a member of this pool.

#### Parameters

##### poolAddress

[`Address`](../type-aliases/Address.md)

The pool contract address to enter

##### amount

[`Amount`](Amount.md)

The amount of tokens to stake

##### options?

[`ExecuteOptions`](../interfaces/ExecuteOptions.md)

Optional execution options

#### Returns

`Promise`\<[`Tx`](Tx.md)\>

A Tx object to track the transaction

#### Throws

Error if the wallet is already a member of the pool

#### Example

```ts
const tx = await wallet.enterPool(poolAddress, Amount.parse("100", STRK));
await tx.wait();
```

#### See

[Staking#enter](Staking.md#enter)

#### Implementation of

[`WalletInterface`](../interfaces/WalletInterface.md).[`enterPool`](../interfaces/WalletInterface.md#enterpool)

***

### addToPool()

> **addToPool**(`poolAddress`, `amount`, `options?`): `Promise`\<[`Tx`](Tx.md)\>

Defined in: [src/wallet/base.ts:405](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L405)

Add more tokens to an existing stake in a pool.

The wallet must already be a member of the pool.
Use `enterPool()` for first-time staking.

#### Parameters

##### poolAddress

[`Address`](../type-aliases/Address.md)

The pool contract address

##### amount

[`Amount`](Amount.md)

The amount of tokens to add

##### options?

[`ExecuteOptions`](../interfaces/ExecuteOptions.md)

Optional execution options

#### Returns

`Promise`\<[`Tx`](Tx.md)\>

A Tx object to track the transaction

#### Throws

Error if the wallet is not a member of the pool

#### Example

```ts
const tx = await wallet.addToPool(poolAddress, Amount.parse("50", STRK));
await tx.wait();
```

#### See

[Staking#add](Staking.md#add)

#### Implementation of

[`WalletInterface`](../interfaces/WalletInterface.md).[`addToPool`](../interfaces/WalletInterface.md#addtopool)

***

### stake()

> **stake**(`poolAddress`, `amount`, `options?`): `Promise`\<[`Tx`](Tx.md)\>

Defined in: [src/wallet/base.ts:434](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L434)

Stake in a pool, automatically entering or adding based on membership.

This is the recommended staking method for most flows:
- If the wallet is not a member, it enters the pool.
- If the wallet is already a member, it adds to the existing stake.

#### Parameters

##### poolAddress

[`Address`](../type-aliases/Address.md)

The pool contract address

##### amount

[`Amount`](Amount.md)

The amount of tokens to stake

##### options?

[`ExecuteOptions`](../interfaces/ExecuteOptions.md)

Optional execution options

#### Returns

`Promise`\<[`Tx`](Tx.md)\>

A Tx object to track the transaction

#### Example

```ts
const tx = await wallet.stake(poolAddress, Amount.parse("100", STRK));
await tx.wait();
```

#### See

[Staking#stake](Staking.md#stake)

#### Implementation of

[`WalletInterface`](../interfaces/WalletInterface.md).[`stake`](../interfaces/WalletInterface.md#stake)

***

### claimPoolRewards()

> **claimPoolRewards**(`poolAddress`, `options?`): `Promise`\<[`Tx`](Tx.md)\>

Defined in: [src/wallet/base.ts:466](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L466)

Claim accumulated staking rewards from a pool.

Transfers all unclaimed rewards to the wallet's reward address.
The wallet must be the reward address for the pool membership.

#### Parameters

##### poolAddress

[`Address`](../type-aliases/Address.md)

The pool contract address

##### options?

[`ExecuteOptions`](../interfaces/ExecuteOptions.md)

Optional execution options

#### Returns

`Promise`\<[`Tx`](Tx.md)\>

A Tx object to track the transaction

#### Throws

Error if the wallet is not a member or has no rewards

#### Example

```ts
const position = await wallet.getPoolPosition(poolAddress);
if (!position?.rewards.isZero()) {
  const tx = await wallet.claimPoolRewards(poolAddress);
  await tx.wait();
}
```

#### See

[Staking#claimRewards](Staking.md#claimrewards)

#### Implementation of

[`WalletInterface`](../interfaces/WalletInterface.md).[`claimPoolRewards`](../interfaces/WalletInterface.md#claimpoolrewards)

***

### exitPoolIntent()

> **exitPoolIntent**(`poolAddress`, `amount`, `options?`): `Promise`\<[`Tx`](Tx.md)\>

Defined in: [src/wallet/base.ts:506](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L506)

Initiate an exit from a delegation pool.

Starts the unstaking process by declaring intent to withdraw.
After calling this, wait for the exit window to pass, then call
`exitPool()` to complete the withdrawal.

The specified amount stops earning rewards immediately and is
locked until the exit window completes.

#### Parameters

##### poolAddress

[`Address`](../type-aliases/Address.md)

The pool contract address

##### amount

[`Amount`](Amount.md)

The amount to unstake

##### options?

[`ExecuteOptions`](../interfaces/ExecuteOptions.md)

Optional execution options

#### Returns

`Promise`\<[`Tx`](Tx.md)\>

A Tx object to track the transaction

#### Throws

Error if the wallet is not a member or has a pending exit

#### Example

```ts
// Step 1: Declare exit intent
const tx = await wallet.exitPoolIntent(poolAddress, Amount.parse("50", STRK));
await tx.wait();

// Step 2: Wait for exit window, then complete
const position = await wallet.getPoolPosition(poolAddress);
if (position?.unpoolTime && new Date() >= position.unpoolTime) {
  await wallet.exitPool(poolAddress);
}
```

#### See

[Staking#exitIntent](Staking.md#exitintent)

#### Implementation of

[`WalletInterface`](../interfaces/WalletInterface.md).[`exitPoolIntent`](../interfaces/WalletInterface.md#exitpoolintent)

***

### exitPool()

> **exitPool**(`poolAddress`, `options?`): `Promise`\<[`Tx`](Tx.md)\>

Defined in: [src/wallet/base.ts:538](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L538)

Complete the exit from a delegation pool.

Finalizes the unstaking process and transfers tokens back to the wallet.
Can only be called after the exit window has passed following `exitPoolIntent()`.

#### Parameters

##### poolAddress

[`Address`](../type-aliases/Address.md)

The pool contract address

##### options?

[`ExecuteOptions`](../interfaces/ExecuteOptions.md)

Optional execution options

#### Returns

`Promise`\<[`Tx`](Tx.md)\>

A Tx object to track the transaction

#### Throws

Error if no exit intent exists or exit window hasn't passed

#### Example

```ts
const position = await wallet.getPoolPosition(poolAddress);
if (position?.unpoolTime && new Date() >= position.unpoolTime) {
  const tx = await wallet.exitPool(poolAddress);
  await tx.wait();
}
```

#### See

[Staking#exit](Staking.md#exit)

#### Implementation of

[`WalletInterface`](../interfaces/WalletInterface.md).[`exitPool`](../interfaces/WalletInterface.md#exitpool)

***

### isPoolMember()

> **isPoolMember**(`poolAddress`): `Promise`\<`boolean`\>

Defined in: [src/wallet/base.ts:558](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L558)

Check if the wallet is a member of a delegation pool.

#### Parameters

##### poolAddress

[`Address`](../type-aliases/Address.md)

The pool contract address

#### Returns

`Promise`\<`boolean`\>

True if the wallet is a pool member, false otherwise

#### Example

```ts
if (await wallet.isPoolMember(poolAddress)) {
  console.log("Already staking in this pool");
}
```

#### See

[Staking#isMember](Staking.md#ismember)

#### Implementation of

[`WalletInterface`](../interfaces/WalletInterface.md).[`isPoolMember`](../interfaces/WalletInterface.md#ispoolmember)

***

### getPoolPosition()

> **getPoolPosition**(`poolAddress`): `Promise`\<[`PoolMember`](../interfaces/PoolMember.md) \| `null`\>

Defined in: [src/wallet/base.ts:583](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L583)

Get the wallet's staking position in a pool.

Returns detailed information including staked amount, unclaimed rewards,
exit/unpooling status, and commission rate.

#### Parameters

##### poolAddress

[`Address`](../type-aliases/Address.md)

The pool contract address

#### Returns

`Promise`\<[`PoolMember`](../interfaces/PoolMember.md) \| `null`\>

The pool member position, or null if not a member

#### Example

```ts
const position = await wallet.getPoolPosition(poolAddress);
if (position) {
  console.log(`Staked: ${position.staked.toFormatted()}`);
  console.log(`Rewards: ${position.rewards.toFormatted()}`);
}
```

#### See

[Staking#getPosition](Staking.md#getposition)

#### Implementation of

[`WalletInterface`](../interfaces/WalletInterface.md).[`getPoolPosition`](../interfaces/WalletInterface.md#getpoolposition)

***

### getPoolCommission()

> **getPoolCommission**(`poolAddress`): `Promise`\<`number`\>

Defined in: [src/wallet/base.ts:605](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L605)

Get the validator's commission rate for a pool.

The commission is the percentage of rewards the validator takes
before distributing to delegators.

#### Parameters

##### poolAddress

[`Address`](../type-aliases/Address.md)

The pool contract address

#### Returns

`Promise`\<`number`\>

The commission as a percentage (e.g., 10 means 10%)

#### Example

```ts
const commission = await wallet.getPoolCommission(poolAddress);
console.log(`Validator commission: ${commission}%`);
```

#### See

[Staking#getCommission](Staking.md#getcommission)

#### Implementation of

[`WalletInterface`](../interfaces/WalletInterface.md).[`getPoolCommission`](../interfaces/WalletInterface.md#getpoolcommission)

***

### staking()

> **staking**(`poolAddress`): `Promise`\<[`Staking`](Staking.md)\>

Defined in: [src/wallet/base.ts:644](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L644)

Get or create a Staking instance for a specific pool.

Uses a cache to avoid creating multiple instances for the same pool.
Use this when you know the pool contract address directly.

#### Parameters

##### poolAddress

[`Address`](../type-aliases/Address.md)

The pool contract address

#### Returns

`Promise`\<[`Staking`](Staking.md)\>

A Staking instance for the specified pool

#### Throws

Error if staking is not configured

#### Throws

Error if the pool doesn't exist

#### Example

```ts
const staking = await wallet.staking(poolAddress);
const position = await staking.getPosition(wallet);
```

#### See

[Staking.fromPool](Staking.md#frompool)

#### Implementation of

[`WalletInterface`](../interfaces/WalletInterface.md).[`staking`](../interfaces/WalletInterface.md#staking)

***

### stakingInStaker()

> **stakingInStaker**(`stakerAddress`, `token`): `Promise`\<[`Staking`](Staking.md)\>

Defined in: [src/wallet/base.ts:695](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L695)

Get or create a Staking instance for a validator's pool.

This is the most common way to access staking when you want to
delegate to a specific validator. Finds the pool for the specified
token managed by the validator.

#### Parameters

##### stakerAddress

[`Address`](../type-aliases/Address.md)

The validator's staker address

##### token

[`Token`](../interfaces/Token.md)

The token to stake (e.g., STRK)

#### Returns

`Promise`\<[`Staking`](Staking.md)\>

A Staking instance for the validator's pool

#### Throws

Error if staking is not configured

#### Throws

Error if the validator doesn't have a pool for the specified token

#### Example

```ts
const staking = await wallet.stakingInStaker(validatorAddress, STRK);
await staking.enter(wallet, Amount.parse("100", STRK));
```

#### See

[Staking.fromStaker](Staking.md#fromstaker)

#### Implementation of

[`WalletInterface`](../interfaces/WalletInterface.md).[`stakingInStaker`](../interfaces/WalletInterface.md#stakinginstaker)
