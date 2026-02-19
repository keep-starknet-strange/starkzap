[**starkzap**](../README.md)

***

[starkzap](../globals.md) / Erc20

# Class: Erc20

Defined in: [src/erc20/erc20.ts:38](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/erc20/erc20.ts#L38)

ERC20 token interaction helper.

Provides methods for common ERC20 operations: approvals, transfers,
and balance queries. Handles both `balance_of` (snake_case) and
`balanceOf` (camelCase) entrypoints for maximum compatibility.

Instances are cached per-token on the wallet via `wallet.erc20(token)`.

## Example

```ts
// Via wallet (recommended)
const balance = await wallet.balanceOf(USDC);
const tx = await wallet.transfer(USDC, [
  { to: recipient, amount: Amount.parse("100", USDC) },
]);

// Direct usage
const erc20 = new Erc20(USDC, provider);
const balance = await erc20.balanceOf(wallet);
```

## Constructors

### Constructor

> **new Erc20**(`token`, `provider`): `Erc20`

Defined in: [src/erc20/erc20.ts:43](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/erc20/erc20.ts#L43)

#### Parameters

##### token

[`Token`](../interfaces/Token.md)

##### provider

`RpcProvider`

#### Returns

`Erc20`

## Methods

### populateApprove()

> **populateApprove**(`spender`, `amount`): [`Call`](../type-aliases/Call.md)

Defined in: [src/erc20/erc20.ts:80](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/erc20/erc20.ts#L80)

**`Internal`**

Build an ERC20 approve Call without executing.

 Used by [TxBuilder](TxBuilder.md) — not part of the public API.

#### Parameters

##### spender

[`Address`](../type-aliases/Address.md)

##### amount

[`Amount`](Amount.md)

#### Returns

[`Call`](../type-aliases/Call.md)

***

### populateTransfer()

> **populateTransfer**(`transfers`): [`Call`](../type-aliases/Call.md)[]

Defined in: [src/erc20/erc20.ts:93](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/erc20/erc20.ts#L93)

**`Internal`**

Build transfer Call(s) without executing.

 Used by [TxBuilder](TxBuilder.md) — not part of the public API.

#### Parameters

##### transfers

`object`[]

#### Returns

[`Call`](../type-aliases/Call.md)[]

***

### transfer()

> **transfer**(`from`, `transfers`, `options?`): `Promise`\<[`Tx`](Tx.md)\>

Defined in: [src/erc20/erc20.ts:124](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/erc20/erc20.ts#L124)

Transfer tokens to one or more addresses.

#### Parameters

##### from

[`WalletInterface`](../interfaces/WalletInterface.md)

Wallet to transfer tokens from

##### transfers

`object`[]

Array of transfer objects, each containing a to address and an Amount

##### options?

[`ExecuteOptions`](../interfaces/ExecuteOptions.md)

Optional execution options

#### Returns

`Promise`\<[`Tx`](Tx.md)\>

#### Example

```ts
const erc20 = wallet.erc20(USDC);
const amount = Amount.parse("100", USDC);

const tx = await erc20.transfer(wallet, [
  { to: recipientAddress, amount },
]);
await tx.wait();
```

#### Throws

Error if any amount's decimals or symbol don't match the token

***

### balanceOf()

> **balanceOf**(`wallet`): `Promise`\<[`Amount`](Amount.md)\>

Defined in: [src/erc20/erc20.ts:147](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/erc20/erc20.ts#L147)

Get the balance in a wallet.

#### Parameters

##### wallet

[`WalletInterface`](../interfaces/WalletInterface.md)

Wallet to check the balance of

#### Returns

`Promise`\<[`Amount`](Amount.md)\>

Amount representing the token balance

#### Example

```ts
const erc20 = wallet.erc20(USDC);
const balance = await erc20.balanceOf(wallet);

console.log(balance.toUnit());      // "100.5"
console.log(balance.toFormatted()); // "100.5 USDC"
```
