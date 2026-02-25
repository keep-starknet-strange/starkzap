[**x**](../README.md)

---

[x](../globals.md) / Staking

# Class: Staking

Defined in: [src/staking/staking.ts:50](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/staking/staking.ts#L50)

Represents a staking delegation pool and provides methods to interact with it.

The Staking class allows delegators to:

- Enter and exit delegation pools
- Add to existing stakes
- Claim rewards
- Query pool information and APY

## Example

```ts
// Get a staking instance for a specific validator
const staking = await Staking.fromStaker(
  validatorAddress,
  strkToken,
  provider,
  config
);

// Enter the pool
const tx = await staking.enter(wallet, Amount.parse(100, strkToken));
await tx.wait();

// Check your position
const position = await staking.getPosition(wallet);
if (position) {
  console.log(`Staked: ${position.staked.toFormatted()}`);
}
```

## Accessors

### poolAddress

#### Get Signature

> **get** **poolAddress**(): [`Address`](../type-aliases/Address.md)

Defined in: [src/staking/staking.ts:70](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/staking/staking.ts#L70)

The pool contract address for this staking instance.

##### Returns

[`Address`](../type-aliases/Address.md)

The Starknet address of the delegation pool contract

## Methods

### populateEnter()

> **populateEnter**(`walletAddress`, `amount`): [`Call`](../type-aliases/Call.md)[]

Defined in: [src/staking/staking.ts:79](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/staking/staking.ts#L79)

**`Internal`**

Build approve + enter pool Calls without executing.

Used by [TxBuilder](TxBuilder.md) — not part of the public API.

#### Parameters

##### walletAddress

[`Address`](../type-aliases/Address.md)

##### amount

[`Amount`](Amount.md)

#### Returns

[`Call`](../type-aliases/Call.md)[]

---

### enter()

> **enter**(`wallet`, `amount`, `options?`): `Promise`\<[`Tx`](Tx.md)\>

Defined in: [src/staking/staking.ts:110](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/staking/staking.ts#L110)

Enter the delegation pool as a new member.

This will approve the token transfer and stake the specified amount in the pool.
The wallet must not already be a member of this pool.

#### Parameters

##### wallet

[`WalletInterface`](../interfaces/WalletInterface.md)

The wallet to stake from

##### amount

[`Amount`](Amount.md)

The amount of tokens to stake

##### options?

[`ExecuteOptions`](../interfaces/ExecuteOptions.md)

Optional execution options (e.g., gas settings)

#### Returns

`Promise`\<[`Tx`](Tx.md)\>

A transaction object that can be awaited for confirmation

#### Throws

Error if the wallet is already a member of the pool

#### Example

```ts
const tx = await staking.enter(wallet, Amount.parse(100, strkToken));
await tx.wait();
```

---

### isMember()

> **isMember**(`wallet`): `Promise`\<`boolean`\>

Defined in: [src/staking/staking.ts:131](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/staking/staking.ts#L131)

Check if a wallet is a member of this delegation pool.

#### Parameters

##### wallet

[`WalletInterface`](../interfaces/WalletInterface.md)

The wallet to check

#### Returns

`Promise`\<`boolean`\>

True if the wallet is a pool member, false otherwise

---

### getPosition()

> **getPosition**(`wallet`): `Promise`\<[`PoolMember`](../interfaces/PoolMember.md) \| `null`\>

Defined in: [src/staking/staking.ts:157](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/staking/staking.ts#L157)

Get the current staking position for a wallet in this pool.

Returns detailed information about the delegator's stake including:

- Staked amount
- Unclaimed rewards
- Exit/unpooling status
- Commission rate

#### Parameters

##### wallet

[`WalletInterface`](../interfaces/WalletInterface.md)

The wallet to query

#### Returns

`Promise`\<[`PoolMember`](../interfaces/PoolMember.md) \| `null`\>

The pool member position, or null if not a member

#### Example

```ts
const position = await staking.getPosition(wallet);
if (position) {
  console.log(`Staked: ${position.staked.toFormatted()}`);
  console.log(`Rewards: ${position.rewards.toFormatted()}`);
}
```

---

### getCommission()

> **getCommission**(): `Promise`\<`number`\>

Defined in: [src/staking/staking.ts:205](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/staking/staking.ts#L205)

Get the validator's commission rate for this pool.

The commission is the percentage of rewards that the validator takes
before distributing to delegators.

#### Returns

`Promise`\<`number`\>

The commission as a percentage (e.g., 10 means 10%)

#### Example

```ts
const commission = await staking.getCommission();
console.log(`Validator commission: ${commission}%`);
```

---

### populateAdd()

> **populateAdd**(`walletAddress`, `amount`): [`Call`](../type-aliases/Call.md)[]

Defined in: [src/staking/staking.ts:215](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/staking/staking.ts#L215)

**`Internal`**

Build approve + add-to-pool Calls without executing.

Used by [TxBuilder](TxBuilder.md) — not part of the public API.

#### Parameters

##### walletAddress

[`Address`](../type-aliases/Address.md)

##### amount

[`Amount`](Amount.md)

#### Returns

[`Call`](../type-aliases/Call.md)[]

---

### add()

> **add**(`wallet`, `amount`, `options?`): `Promise`\<[`Tx`](Tx.md)\>

Defined in: [src/staking/staking.ts:245](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/staking/staking.ts#L245)

Add more tokens to an existing stake in the pool.

The wallet must already be a member of the pool. Use `enter()` for first-time staking.

#### Parameters

##### wallet

[`WalletInterface`](../interfaces/WalletInterface.md)

The wallet to add stake from

##### amount

[`Amount`](Amount.md)

The amount of tokens to add

##### options?

[`ExecuteOptions`](../interfaces/ExecuteOptions.md)

Optional execution options

#### Returns

`Promise`\<[`Tx`](Tx.md)\>

A transaction object that can be awaited for confirmation

#### Throws

Error if the wallet is not a member of the pool

#### Example

```ts
const tx = await staking.add(wallet, Amount.parse(50, strkToken));
await tx.wait();
```

---

### populateClaimRewards()

> **populateClaimRewards**(`walletAddress`): [`Call`](../type-aliases/Call.md)

Defined in: [src/staking/staking.ts:260](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/staking/staking.ts#L260)

**`Internal`**

Build a claim-rewards Call without executing.

Used by [TxBuilder](TxBuilder.md) — not part of the public API.

#### Parameters

##### walletAddress

[`Address`](../type-aliases/Address.md)

#### Returns

[`Call`](../type-aliases/Call.md)

---

### claimRewards()

> **claimRewards**(`wallet`, `options?`): `Promise`\<[`Tx`](Tx.md)\>

Defined in: [src/staking/staking.ts:286](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/staking/staking.ts#L286)

Claim accumulated staking rewards.

Transfers all unclaimed rewards to the wallet's reward address.
The caller must be the reward address for this pool member.

#### Parameters

##### wallet

[`WalletInterface`](../interfaces/WalletInterface.md)

The wallet to claim rewards for

##### options?

[`ExecuteOptions`](../interfaces/ExecuteOptions.md)

Optional execution options

#### Returns

`Promise`\<[`Tx`](Tx.md)\>

A transaction object that can be awaited for confirmation

#### Throws

Error if the wallet is not a member of the pool

#### Throws

Error if the caller is not the reward address for this member

#### Throws

Error if there are no rewards to claim

#### Example

```ts
const position = await staking.getPosition(wallet);
if (position && !position.rewards.isZero()) {
  const tx = await staking.claimRewards(wallet);
  await tx.wait();
}
```

---

### populateExitIntent()

> **populateExitIntent**(`amount`): [`Call`](../type-aliases/Call.md)

Defined in: [src/staking/staking.ts:309](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/staking/staking.ts#L309)

**`Internal`**

Build an exit-intent Call without executing.

Used by [TxBuilder](TxBuilder.md) — not part of the public API.

#### Parameters

##### amount

[`Amount`](Amount.md)

#### Returns

[`Call`](../type-aliases/Call.md)

---

### exitIntent()

> **exitIntent**(`wallet`, `amount`, `options?`): `Promise`\<[`Tx`](Tx.md)\>

Defined in: [src/staking/staking.ts:348](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/staking/staking.ts#L348)

Initiate an exit from the delegation pool.

This starts the unstaking process by declaring intent to withdraw.
After calling this, you must wait for the exit window to pass before
calling `exit()` to complete the withdrawal.

The specified amount will stop earning rewards immediately and will
be locked until the exit window completes.

#### Parameters

##### wallet

[`WalletInterface`](../interfaces/WalletInterface.md)

The wallet to exit from the pool

##### amount

[`Amount`](Amount.md)

The amount to unstake

##### options?

[`ExecuteOptions`](../interfaces/ExecuteOptions.md)

Optional execution options

#### Returns

`Promise`\<[`Tx`](Tx.md)\>

A transaction object that can be awaited for confirmation

#### Throws

Error if the wallet is not a member of the pool

#### Throws

Error if the wallet already has a pending exit

#### Throws

Error if the requested amount exceeds the staked balance

#### Example

```ts
// Step 1: Declare exit intent
const exitTx = await staking.exitIntent(wallet, Amount.parse(50, strkToken));
await exitTx.wait();

// Step 2: Wait for exit window (check position.unpoolTime)
const position = await staking.getPosition(wallet);
console.log(`Can exit after: ${position?.unpoolTime}`);

// Step 3: Complete exit after window passes
const completeTx = await staking.exit(wallet);
await completeTx.wait();
```

---

### populateExit()

> **populateExit**(`walletAddress`): [`Call`](../type-aliases/Call.md)

Defined in: [src/staking/staking.ts:374](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/staking/staking.ts#L374)

**`Internal`**

Build an exit-pool Call without executing.

Used by [TxBuilder](TxBuilder.md) — not part of the public API.

#### Parameters

##### walletAddress

[`Address`](../type-aliases/Address.md)

#### Returns

[`Call`](../type-aliases/Call.md)

---

### exit()

> **exit**(`wallet`, `options?`): `Promise`\<[`Tx`](Tx.md)\>

Defined in: [src/staking/staking.ts:400](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/staking/staking.ts#L400)

Complete the exit from the delegation pool.

This finalizes the unstaking process and transfers the tokens back to the wallet.
Can only be called after the exit window has passed following an `exitIntent()` call.

#### Parameters

##### wallet

[`WalletInterface`](../interfaces/WalletInterface.md)

The wallet completing the exit

##### options?

[`ExecuteOptions`](../interfaces/ExecuteOptions.md)

Optional execution options

#### Returns

`Promise`\<[`Tx`](Tx.md)\>

A transaction object that can be awaited for confirmation

#### Throws

Error if no exit intent exists or the exit window hasn't passed

#### Example

```ts
const position = await staking.getPosition(wallet);
if (position?.unpoolTime && new Date() >= position.unpoolTime) {
  const tx = await staking.exit(wallet);
  await tx.wait();
}
```

---

### fromPool()

> `static` **fromPool**(`poolAddress`, `provider`, `config`): `Promise`\<`Staking`\>

Defined in: [src/staking/staking.ts:471](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/staking/staking.ts#L471)

Create a Staking instance from a known pool contract address.

Use this when you know the specific pool contract address you want to interact with.

#### Parameters

##### poolAddress

[`Address`](../type-aliases/Address.md)

The pool contract address

##### provider

`RpcProvider`

The RPC provider

##### config

[`StakingConfig`](../interfaces/StakingConfig.md)

The staking configuration

#### Returns

`Promise`\<`Staking`\>

A Staking instance for the specified pool

#### Throws

Error if the pool doesn't exist or token cannot be resolved

#### Example

```ts
const staking = await Staking.fromPool(poolAddress, provider, config.staking);
```

---

### fromStaker()

> `static` **fromStaker**(`stakerAddress`, `token`, `provider`, `config`): `Promise`\<`Staking`\>

Defined in: [src/staking/staking.ts:547](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/staking/staking.ts#L547)

Create a Staking instance from a validator's (staker's) address.

This is the most common way to get a Staking instance when you want to
delegate to a specific validator. The method finds the pool for the
specified token managed by this validator.

#### Parameters

##### stakerAddress

[`Address`](../type-aliases/Address.md)

The validator's staker address

##### token

[`Token`](../interfaces/Token.md)

The token to stake (e.g., STRK)

##### provider

`RpcProvider`

The RPC provider

##### config

[`StakingConfig`](../interfaces/StakingConfig.md)

The staking configuration

#### Returns

`Promise`\<`Staking`\>

A Staking instance for the validator's pool

#### Throws

Error if the validator doesn't have a pool for the specified token

#### Example

```ts
const staking = await Staking.fromStaker(
  validatorAddress,
  strkToken,
  provider,
  config.staking
);
```

---

### activeTokens()

> `static` **activeTokens**(`provider`, `config`): `Promise`\<[`Token`](../interfaces/Token.md)[]\>

Defined in: [src/staking/staking.ts:595](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/staking/staking.ts#L595)

Get all tokens that are currently enabled for staking.

Returns the list of tokens that can be staked in the protocol.
Typically, includes STRK and may include other tokens like wrapped BTC.

#### Parameters

##### provider

`RpcProvider`

The RPC provider

##### config

[`StakingConfig`](../interfaces/StakingConfig.md)

The staking configuration

#### Returns

`Promise`\<[`Token`](../interfaces/Token.md)[]\>

Array of tokens that can be staked

#### Example

```ts
const tokens = await Staking.activeTokens(provider, config.staking);
console.log(`Stakeable tokens: ${tokens.map((t) => t.symbol).join(", ")}`);
```

---

### getStakerPools()

> `static` **getStakerPools**(`provider`, `stakerAddress`, `config`): `Promise`\<[`Pool`](../interfaces/Pool.md)[]\>

Defined in: [src/staking/staking.ts:636](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/staking/staking.ts#L636)

Get all delegation pools managed by a specific validator.

Validators can have multiple pools, one for each supported token.
This method returns information about each pool including the
pool contract address, token, and total delegated amount.

#### Parameters

##### provider

`RpcProvider`

The RPC provider

##### stakerAddress

[`Address`](../type-aliases/Address.md)

The validator's staker address

##### config

[`StakingConfig`](../interfaces/StakingConfig.md)

The staking configuration

#### Returns

`Promise`\<[`Pool`](../interfaces/Pool.md)[]\>

Array of pools managed by the validator

#### Example

```ts
const pools = await Staking.getStakerPools(
  provider,
  validatorAddress,
  config.staking
);
for (const pool of pools) {
  console.log(
    `${pool.token.symbol} pool: ${pool.amount.toFormatted()} delegated`
  );
}
```
