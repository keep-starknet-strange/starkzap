[**x**](../README.md)

---

[x](../globals.md) / TxBuilder

# Class: TxBuilder

Defined in: [src/tx/builder.ts:52](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/tx/builder.ts#L52)

Fluent transaction builder for batching multiple operations into a single transaction.

Instead of executing each operation separately, `TxBuilder` collects contract calls
and submits them all at once via `wallet.execute()`. This saves gas and ensures
atomicity — either every operation succeeds or none of them do.

Create a builder via `wallet.tx()`, chain operations, then call `.send()`.

## Examples

```ts
// Approve + stake in one transaction
const tx = await wallet
  .tx()
  .enterPool(poolAddress, Amount.parse("100", STRK))
  .send();
await tx.wait();
```

```ts
// Transfer multiple tokens + claim rewards atomically
const tx = await wallet
  .tx()
  .transfer(USDC, [
    { to: alice, amount: Amount.parse("50", USDC) },
    { to: bob, amount: Amount.parse("25", USDC) },
  ])
  .claimPoolRewards(poolAddress)
  .send();
```

```ts
// Mix high-level helpers with raw calls
const tx = await wallet.tx()
  .approve(STRK, dexAddress, amount)
  .add({ contractAddress: dexAddress, entrypoint: "swap", calldata: [...] })
  .transfer(USDC, { to: alice, amount: usdcAmount })
  .send();
```

## Constructors

### Constructor

> **new TxBuilder**(`wallet`): `TxBuilder`

Defined in: [src/tx/builder.ts:57](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/tx/builder.ts#L57)

#### Parameters

##### wallet

[`WalletInterface`](../interfaces/WalletInterface.md)

#### Returns

`TxBuilder`

## Accessors

### length

#### Get Signature

> **get** **length**(): `number`

Defined in: [src/tx/builder.ts:71](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/tx/builder.ts#L71)

The number of pending operations in the builder.

Each chained method counts as one operation, even if it expands
into multiple calls once resolved.

##### Returns

`number`

---

### isEmpty

#### Get Signature

> **get** **isEmpty**(): `boolean`

Defined in: [src/tx/builder.ts:78](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/tx/builder.ts#L78)

Whether the builder has no pending operations.

##### Returns

`boolean`

---

### isSent

#### Get Signature

> **get** **isSent**(): `boolean`

Defined in: [src/tx/builder.ts:85](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/tx/builder.ts#L85)

Whether `send()` has already been called successfully on this builder.

##### Returns

`boolean`

## Methods

### add()

> **add**(...`calls`): `this`

Defined in: [src/tx/builder.ts:113](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/tx/builder.ts#L113)

Add one or more raw contract calls to the transaction.

Use this for custom contract interactions not covered by the
built-in helpers.

#### Parameters

##### calls

...[`Call`](../type-aliases/Call.md)[]

Raw Call objects to include

#### Returns

`this`

this (for chaining)

#### Example

```ts
wallet
  .tx()
  .add({
    contractAddress: "0x...",
    entrypoint: "my_function",
    calldata: [1, 2, 3],
  })
  .send();
```

---

### approve()

> **approve**(`token`, `spender`, `amount`): `this`

Defined in: [src/tx/builder.ts:138](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/tx/builder.ts#L138)

Approve an address to spend ERC20 tokens on behalf of the wallet.

#### Parameters

##### token

[`Token`](../interfaces/Token.md)

The ERC20 token to approve

##### spender

[`Address`](../type-aliases/Address.md)

The address to approve spending for

##### amount

[`Amount`](Amount.md)

The amount to approve

#### Returns

`this`

this (for chaining)

#### Example

```ts
wallet
  .tx()
  .approve(USDC, dexAddress, Amount.parse("1000", USDC))
  .add(dexSwapCall)
  .send();
```

---

### transfer()

> **transfer**(`token`, `transfers`): `this`

Defined in: [src/tx/builder.ts:170](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/tx/builder.ts#L170)

Transfer ERC20 tokens to one or more recipients.

Accepts a single transfer object or an array of transfers.
Multiple transfers to the same token are batched efficiently.

#### Parameters

##### token

[`Token`](../interfaces/Token.md)

The ERC20 token to transfer

##### transfers

A single transfer or array of transfers

\{ `to`: [`Address`](../type-aliases/Address.md); `amount`: [`Amount`](Amount.md); \} | `object`[]

#### Returns

`this`

this (for chaining)

#### Example

```ts
// Single transfer
wallet
  .tx()
  .transfer(USDC, { to: alice, amount: Amount.parse("50", USDC) })
  .send();

// Multiple transfers
wallet
  .tx()
  .transfer(USDC, [
    { to: alice, amount: Amount.parse("50", USDC) },
    { to: bob, amount: Amount.parse("25", USDC) },
  ])
  .send();
```

---

### stake()

> **stake**(`poolAddress`, `amount`): `this`

Defined in: [src/tx/builder.ts:212](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/tx/builder.ts#L212)

Stake tokens in a delegation pool, automatically choosing the right
action based on current membership status.

- If the wallet is **not** a member, calls `enter_delegation_pool`.
- If the wallet **is** already a member, calls `add_to_delegation_pool`.

In both cases the token approve call is included automatically.

This is the **recommended** way to stake via the builder. Prefer this
over [enterPool](#enterpool) and [addToPool](#addtopool) unless you need explicit
control over which entrypoint is called.

#### Parameters

##### poolAddress

[`Address`](../type-aliases/Address.md)

The pool contract address

##### amount

[`Amount`](Amount.md)

The amount of tokens to stake

#### Returns

`this`

this (for chaining)

#### Example

```ts
// Works whether the wallet is a new or existing member
const tx = await wallet
  .tx()
  .stake(poolAddress, Amount.parse("100", STRK))
  .send();
await tx.wait();
```

---

### enterPool()

> **enterPool**(`poolAddress`, `amount`): `this`

Defined in: [src/tx/builder.ts:244](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/tx/builder.ts#L244)

Enter a delegation pool as a new member.

Automatically includes the token approve call before the pool entry call.

**Prefer [stake](#stake)** which auto-detects membership. Only use this if
you are certain the wallet is not already a member — the transaction will
revert on-chain otherwise.

#### Parameters

##### poolAddress

[`Address`](../type-aliases/Address.md)

The pool contract address to enter

##### amount

[`Amount`](Amount.md)

The amount of tokens to stake

#### Returns

`this`

this (for chaining)

#### Example

```ts
wallet.tx().enterPool(poolAddress, Amount.parse("100", STRK)).send();
```

---

### addToPool()

> **addToPool**(`poolAddress`, `amount`): `this`

Defined in: [src/tx/builder.ts:273](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/tx/builder.ts#L273)

Add more tokens to an existing stake in a pool.

Automatically includes the token approve call before the add-to-pool call.

**Prefer [stake](#stake)** which auto-detects membership. Only use this if
you are certain the wallet is already a member — the transaction will
revert on-chain otherwise.

#### Parameters

##### poolAddress

[`Address`](../type-aliases/Address.md)

The pool contract address

##### amount

[`Amount`](Amount.md)

The amount of tokens to add

#### Returns

`this`

this (for chaining)

#### Example

```ts
wallet.tx().addToPool(poolAddress, Amount.parse("50", STRK)).send();
```

---

### claimPoolRewards()

> **claimPoolRewards**(`poolAddress`): `this`

Defined in: [src/tx/builder.ts:299](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/tx/builder.ts#L299)

Claim accumulated staking rewards from a pool.

**Note:** Unlike `wallet.claimPoolRewards()`, this does not verify
membership. The transaction will revert on-chain if the wallet is not
a member of the pool.

#### Parameters

##### poolAddress

[`Address`](../type-aliases/Address.md)

The pool contract address

#### Returns

`this`

this (for chaining)

#### Example

```ts
wallet.tx().claimPoolRewards(poolAddress).send();
```

---

### exitPoolIntent()

> **exitPoolIntent**(`poolAddress`, `amount`): `this`

Defined in: [src/tx/builder.ts:329](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/tx/builder.ts#L329)

Initiate an exit from a delegation pool.

After this, wait for the exit window to pass, then call [exitPool](#exitpool)
to complete the withdrawal.

**Note:** Unlike `wallet.exitPoolIntent()`, this does not verify
membership or balance. The transaction will revert on-chain if the
wallet is not a member or has insufficient stake.

#### Parameters

##### poolAddress

[`Address`](../type-aliases/Address.md)

The pool contract address

##### amount

[`Amount`](Amount.md)

The amount to unstake

#### Returns

`this`

this (for chaining)

#### Example

```ts
wallet.tx().exitPoolIntent(poolAddress, Amount.parse("50", STRK)).send();
```

---

### exitPool()

> **exitPool**(`poolAddress`): `this`

Defined in: [src/tx/builder.ts:355](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/tx/builder.ts#L355)

Complete the exit from a delegation pool after the exit window has passed.

**Note:** Unlike `wallet.exitPool()`, this does not verify that an exit
intent exists. The transaction will revert on-chain if no prior
[exitPoolIntent](#exitpoolintent) was submitted or the exit window has not elapsed.

#### Parameters

##### poolAddress

[`Address`](../type-aliases/Address.md)

The pool contract address

#### Returns

`this`

this (for chaining)

#### Example

```ts
wallet.tx().exitPool(poolAddress).send();
```

---

### calls()

> **calls**(): `Promise`\<[`Call`](../type-aliases/Call.md)[]\>

Defined in: [src/tx/builder.ts:385](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/tx/builder.ts#L385)

Resolve all pending operations into a flat array of Calls without executing.

Useful for inspection, preflight simulation, or fee estimation.

#### Returns

`Promise`\<[`Call`](../type-aliases/Call.md)[]\>

A flat array of all collected Call objects

#### Example

```ts
const calls = await wallet
  .tx()
  .transfer(USDC, { to: alice, amount })
  .enterPool(poolAddress, stakeAmount)
  .calls();

const fee = await wallet.estimateFee(calls);
```

---

### estimateFee()

> **estimateFee**(): `Promise`\<`EstimateFeeResponseOverhead`\>

Defined in: [src/tx/builder.ts:407](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/tx/builder.ts#L407)

Estimate the fee for all collected calls.

Resolves any pending async operations and estimates the execution fee.

#### Returns

`Promise`\<`EstimateFeeResponseOverhead`\>

Fee estimation including overall fee, gas price, and gas bounds

#### Example

```ts
const fee = await wallet
  .tx()
  .transfer(USDC, { to: alice, amount })
  .stake(poolAddress, stakeAmount)
  .estimateFee();

console.log("Estimated fee:", fee.overall_fee);
```

---

### preflight()

> **preflight**(): `Promise`\<[`PreflightResult`](../type-aliases/PreflightResult.md)\>

Defined in: [src/tx/builder.ts:436](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/tx/builder.ts#L436)

Simulate the transaction to check if it would succeed.

Resolves all pending operations and runs them through the wallet's
preflight simulation without submitting on-chain. Use this to
validate the transaction before calling [send](#send).

#### Returns

`Promise`\<[`PreflightResult`](../type-aliases/PreflightResult.md)\>

`{ ok: true }` if the simulation succeeds, or
`{ ok: false, reason: string }` with a human-readable error

#### Example

```ts
const builder = wallet
  .tx()
  .stake(poolAddress, amount)
  .transfer(USDC, { to: alice, amount: usdcAmount });

const result = await builder.preflight();
if (!result.ok) {
  console.error("Transaction would fail:", result.reason);
} else {
  await builder.send();
}
```

---

### send()

> **send**(`options?`): `Promise`\<[`Tx`](Tx.md)\>

Defined in: [src/tx/builder.ts:465](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/tx/builder.ts#L465)

Execute all collected calls as a single atomic transaction.

Resolves any pending async operations (e.g., staking pool lookups),
flattens all calls, and submits them via `wallet.execute()`.

Can only be called once per builder instance.

#### Parameters

##### options?

[`ExecuteOptions`](../interfaces/ExecuteOptions.md)

Optional execution options (e.g., fee mode, gas settings)

#### Returns

`Promise`\<[`Tx`](Tx.md)\>

A Tx object to track the transaction

#### Throws

Error if no calls have been added or if already sent

#### Example

```ts
const tx = await wallet
  .tx()
  .approve(STRK, poolAddress, stakeAmount)
  .enterPool(poolAddress, stakeAmount)
  .transfer(USDC, { to: alice, amount: usdcAmount })
  .send();

console.log(tx.explorerUrl);
await tx.wait();
```
