[**starkzap**](../README.md)

***

[starkzap](../globals.md) / Wallet

# Class: Wallet

Defined in: [src/wallet/index.ts:108](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/index.ts#L108)

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

## Extends

- [`BaseWallet`](BaseWallet.md)

## Properties

### address

> `readonly` **address**: [`Address`](../type-aliases/Address.md)

Defined in: [src/wallet/base.ts:62](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L62)

The wallet's Starknet address

#### Inherited from

[`BaseWallet`](BaseWallet.md).[`address`](BaseWallet.md#address)

## Methods

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

#### Inherited from

[`BaseWallet`](BaseWallet.md).[`callContract`](BaseWallet.md#callcontract)

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

#### Inherited from

[`BaseWallet`](BaseWallet.md).[`tx`](BaseWallet.md#tx)

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

#### Inherited from

[`BaseWallet`](BaseWallet.md).[`getQuote`](BaseWallet.md#getquote)

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

#### Inherited from

[`BaseWallet`](BaseWallet.md).[`swap`](BaseWallet.md#swap)

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

#### Inherited from

[`BaseWallet`](BaseWallet.md).[`registerSwapProvider`](BaseWallet.md#registerswapprovider)

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

#### Inherited from

[`BaseWallet`](BaseWallet.md).[`setDefaultSwapProvider`](BaseWallet.md#setdefaultswapprovider)

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

#### Inherited from

[`BaseWallet`](BaseWallet.md).[`getSwapProvider`](BaseWallet.md#getswapprovider)

***

### listSwapProviders()

> **listSwapProviders**(): `string`[]

Defined in: [src/wallet/base.ts:230](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L230)

List registered swap provider ids.

#### Returns

`string`[]

#### Inherited from

[`BaseWallet`](BaseWallet.md).[`listSwapProviders`](BaseWallet.md#listswapproviders)

***

### getDefaultSwapProvider()

> **getDefaultSwapProvider**(): [`SwapProvider`](../type-aliases/SwapProvider.md)

Defined in: [src/wallet/base.ts:234](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L234)

Resolve the wallet default swap provider.

#### Returns

[`SwapProvider`](../type-aliases/SwapProvider.md)

#### Inherited from

[`BaseWallet`](BaseWallet.md).[`getDefaultSwapProvider`](BaseWallet.md#getdefaultswapprovider)

***

### clearCaches()

> `protected` **clearCaches**(): `void`

Defined in: [src/wallet/base.ts:241](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/base.ts#L241)

#### Returns

`void`

#### Inherited from

[`BaseWallet`](BaseWallet.md).[`clearCaches`](BaseWallet.md#clearcaches)

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

#### Inherited from

[`BaseWallet`](BaseWallet.md).[`erc20`](BaseWallet.md#erc20)

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

#### Inherited from

[`BaseWallet`](BaseWallet.md).[`transfer`](BaseWallet.md#transfer)

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

#### Inherited from

[`BaseWallet`](BaseWallet.md).[`balanceOf`](BaseWallet.md#balanceof)

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

#### Inherited from

[`BaseWallet`](BaseWallet.md).[`enterPool`](BaseWallet.md#enterpool)

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

#### Inherited from

[`BaseWallet`](BaseWallet.md).[`addToPool`](BaseWallet.md#addtopool)

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

#### Inherited from

[`BaseWallet`](BaseWallet.md).[`stake`](BaseWallet.md#stake)

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

#### Inherited from

[`BaseWallet`](BaseWallet.md).[`claimPoolRewards`](BaseWallet.md#claimpoolrewards)

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

#### Inherited from

[`BaseWallet`](BaseWallet.md).[`exitPoolIntent`](BaseWallet.md#exitpoolintent)

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

#### Inherited from

[`BaseWallet`](BaseWallet.md).[`exitPool`](BaseWallet.md#exitpool)

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

#### Inherited from

[`BaseWallet`](BaseWallet.md).[`isPoolMember`](BaseWallet.md#ispoolmember)

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

#### Inherited from

[`BaseWallet`](BaseWallet.md).[`getPoolPosition`](BaseWallet.md#getpoolposition)

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

#### Inherited from

[`BaseWallet`](BaseWallet.md).[`getPoolCommission`](BaseWallet.md#getpoolcommission)

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

#### Inherited from

[`BaseWallet`](BaseWallet.md).[`staking`](BaseWallet.md#staking)

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

#### Inherited from

[`BaseWallet`](BaseWallet.md).[`stakingInStaker`](BaseWallet.md#stakinginstaker)

***

### create()

> `static` **create**(`options`): `Promise`\<`Wallet`\>

Defined in: [src/wallet/index.ts:154](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/index.ts#L154)

Create a new Wallet instance.

#### Parameters

##### options

[`WalletOptions`](../interfaces/WalletOptions.md)

#### Returns

`Promise`\<`Wallet`\>

#### Example

```ts
// With signer (address computed from public key)
const wallet = await Wallet.create({
  account: { signer: new StarkSigner(privateKey), accountClass: ArgentPreset },
  provider,
  config,
});

// With known address (skips address computation)
const wallet = await Wallet.create({
  account: { signer: new StarkSigner(privateKey) },
  address: "0x123...",
  provider,
  config,
});
```

***

### isDeployed()

> **isDeployed**(): `Promise`\<`boolean`\>

Defined in: [src/wallet/index.ts:222](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/index.ts#L222)

Check if the account contract is deployed on-chain.

#### Returns

`Promise`\<`boolean`\>

#### Overrides

[`BaseWallet`](BaseWallet.md).[`isDeployed`](BaseWallet.md#isdeployed)

***

### ensureReady()

> **ensureReady**(`options?`): `Promise`\<`void`\>

Defined in: [src/wallet/index.ts:267](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/index.ts#L267)

Ensure the wallet is ready for transactions.
Optionally deploys the account if needed.

#### Parameters

##### options?

[`EnsureReadyOptions`](../interfaces/EnsureReadyOptions.md) = `{}`

#### Returns

`Promise`\<`void`\>

#### Overrides

[`BaseWallet`](BaseWallet.md).[`ensureReady`](BaseWallet.md#ensureready)

***

### deploy()

> **deploy**(`options?`): `Promise`\<[`Tx`](Tx.md)\>

Defined in: [src/wallet/index.ts:271](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/index.ts#L271)

Deploy the account contract.
Returns a Tx object to track the deployment.

#### Parameters

##### options?

[`DeployOptions`](../interfaces/DeployOptions.md) = `{}`

#### Returns

`Promise`\<[`Tx`](Tx.md)\>

#### Overrides

[`BaseWallet`](BaseWallet.md).[`deploy`](BaseWallet.md#deploy)

***

### execute()

> **execute**(`calls`, `options?`): `Promise`\<[`Tx`](Tx.md)\>

Defined in: [src/wallet/index.ts:480](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/index.ts#L480)

Execute one or more contract calls.
Returns a Tx object to track the transaction.

#### Parameters

##### calls

[`Call`](../type-aliases/Call.md)[]

##### options?

[`ExecuteOptions`](../interfaces/ExecuteOptions.md) = `{}`

#### Returns

`Promise`\<[`Tx`](Tx.md)\>

#### Overrides

[`BaseWallet`](BaseWallet.md).[`execute`](BaseWallet.md#execute)

***

### signMessage()

> **signMessage**(`typedData`): `Promise`\<`Signature`\>

Defined in: [src/wallet/index.ts:540](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/index.ts#L540)

Sign a typed data message (EIP-712 style).
Returns the signature.

#### Parameters

##### typedData

`TypedData`

#### Returns

`Promise`\<`Signature`\>

#### Overrides

[`BaseWallet`](BaseWallet.md).[`signMessage`](BaseWallet.md#signmessage)

***

### preflight()

> **preflight**(`options`): `Promise`\<[`PreflightResult`](../type-aliases/PreflightResult.md)\>

Defined in: [src/wallet/index.ts:544](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/index.ts#L544)

Simulate a transaction to check if it would succeed.

#### Parameters

##### options

[`PreflightOptions`](../interfaces/PreflightOptions.md)

#### Returns

`Promise`\<[`PreflightResult`](../type-aliases/PreflightResult.md)\>

#### Overrides

[`BaseWallet`](BaseWallet.md).[`preflight`](BaseWallet.md#preflight)

***

### getAccount()

> **getAccount**(): `Account`

Defined in: [src/wallet/index.ts:552](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/index.ts#L552)

Get the underlying starknet.js Account instance.
Use this for advanced operations not covered by the SDK.

#### Returns

`Account`

#### Overrides

[`BaseWallet`](BaseWallet.md).[`getAccount`](BaseWallet.md#getaccount)

***

### getProvider()

> **getProvider**(): [`RpcProvider`](../interfaces/RpcProvider.md)

Defined in: [src/wallet/index.ts:556](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/index.ts#L556)

Get the RPC provider instance.
Use this for read-only operations like balance queries.

#### Returns

[`RpcProvider`](../interfaces/RpcProvider.md)

#### Overrides

[`BaseWallet`](BaseWallet.md).[`getProvider`](BaseWallet.md#getprovider)

***

### getChainId()

> **getChainId**(): [`ChainId`](ChainId.md)

Defined in: [src/wallet/index.ts:563](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/index.ts#L563)

Get the chain ID this wallet is connected to.

#### Returns

[`ChainId`](ChainId.md)

#### Overrides

[`BaseWallet`](BaseWallet.md).[`getChainId`](BaseWallet.md#getchainid)

***

### getFeeMode()

> **getFeeMode**(): [`FeeMode`](../type-aliases/FeeMode.md)

Defined in: [src/wallet/index.ts:570](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/index.ts#L570)

Get the default fee mode for this wallet.

#### Returns

[`FeeMode`](../type-aliases/FeeMode.md)

#### Overrides

[`BaseWallet`](BaseWallet.md).[`getFeeMode`](BaseWallet.md#getfeemode)

***

### getClassHash()

> **getClassHash**(): `string`

Defined in: [src/wallet/index.ts:577](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/index.ts#L577)

Get the account class hash.

#### Returns

`string`

#### Overrides

[`BaseWallet`](BaseWallet.md).[`getClassHash`](BaseWallet.md#getclasshash)

***

### estimateFee()

> **estimateFee**(`calls`): `Promise`\<`EstimateFeeResponseOverhead`\>

Defined in: [src/wallet/index.ts:592](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/index.ts#L592)

Estimate the fee for executing calls.

#### Parameters

##### calls

[`Call`](../type-aliases/Call.md)[]

#### Returns

`Promise`\<`EstimateFeeResponseOverhead`\>

#### Example

```ts
const fee = await wallet.estimateFee([
  { contractAddress: "0x...", entrypoint: "transfer", calldata: [...] }
]);
console.log(`Estimated fee: ${fee.overall_fee}`);
```

#### Overrides

[`BaseWallet`](BaseWallet.md).[`estimateFee`](BaseWallet.md#estimatefee)

***

### disconnect()

> **disconnect**(): `Promise`\<`void`\>

Defined in: [src/wallet/index.ts:596](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/wallet/index.ts#L596)

Disconnect the wallet and clean up resources.

#### Returns

`Promise`\<`void`\>

#### Overrides

[`BaseWallet`](BaseWallet.md).[`disconnect`](BaseWallet.md#disconnect)
