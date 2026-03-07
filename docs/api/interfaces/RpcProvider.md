[**starkzap**](../README.md)

***

[starkzap](../globals.md) / RpcProvider

# Interface: RpcProvider

Defined in: node\_modules/starknet/dist/index.d.ts:4972

## Extends

- `RpcProvider_base`

## Properties

### responseParser

> **responseParser**: `RPCResponseParser`

Defined in: node\_modules/starknet/dist/index.d.ts:4756

#### Inherited from

`RpcProvider_base.responseParser`

***

### channel

> **channel**: `RpcChannel$1` \| `RpcChannel`

Defined in: node\_modules/starknet/dist/index.d.ts:4757

#### Inherited from

`RpcProvider_base.channel`

***

### getStateUpdate()

> **getStateUpdate**: \{(): `Promise`\<\{ `block_hash`: `string`; `new_root`: `string`; `old_root`: `string`; `state_diff`: \{ `storage_diffs`: `object`[]; `deprecated_declared_classes`: `string`[]; `declared_classes`: `object`[]; `deployed_contracts`: `object`[]; `replaced_classes`: `object`[]; `nonces`: `object`[]; `migrated_compiled_classes?`: `object`[]; \}; \}\>; (`blockIdentifier`): `Promise`\<\{ `block_hash`: `never`; `state_diff`: \{ `storage_diffs`: `object`[]; `deprecated_declared_classes`: `string`[]; `declared_classes`: `object`[]; `deployed_contracts`: `object`[]; `replaced_classes`: `object`[]; `nonces`: `object`[]; `migrated_compiled_classes?`: `object`[]; \}; `old_root?`: `string`; \}\>; (`blockIdentifier`): `Promise`\<\{ `block_hash`: `string`; `new_root`: `string`; `old_root`: `string`; `state_diff`: \{ `storage_diffs`: `object`[]; `deprecated_declared_classes`: `string`[]; `declared_classes`: `object`[]; `deployed_contracts`: `object`[]; `replaced_classes`: `object`[]; `nonces`: `object`[]; `migrated_compiled_classes?`: `object`[]; \}; \}\>; (`blockIdentifier?`): `Promise`\<`StateUpdateResponse`\>; \}

Defined in: node\_modules/starknet/dist/index.d.ts:4817

Gets the state changes in a specific block (result of executing the requested block)

#### Call Signature

> (): `Promise`\<\{ `block_hash`: `string`; `new_root`: `string`; `old_root`: `string`; `state_diff`: \{ `storage_diffs`: `object`[]; `deprecated_declared_classes`: `string`[]; `declared_classes`: `object`[]; `deployed_contracts`: `object`[]; `replaced_classes`: `object`[]; `nonces`: `object`[]; `migrated_compiled_classes?`: `object`[]; \}; \}\>

##### Returns

`Promise`\<\{ `block_hash`: `string`; `new_root`: `string`; `old_root`: `string`; `state_diff`: \{ `storage_diffs`: `object`[]; `deprecated_declared_classes`: `string`[]; `declared_classes`: `object`[]; `deployed_contracts`: `object`[]; `replaced_classes`: `object`[]; `nonces`: `object`[]; `migrated_compiled_classes?`: `object`[]; \}; \}\>

#### Call Signature

> (`blockIdentifier`): `Promise`\<\{ `block_hash`: `never`; `state_diff`: \{ `storage_diffs`: `object`[]; `deprecated_declared_classes`: `string`[]; `declared_classes`: `object`[]; `deployed_contracts`: `object`[]; `replaced_classes`: `object`[]; `nonces`: `object`[]; `migrated_compiled_classes?`: `object`[]; \}; `old_root?`: `string`; \}\>

##### Parameters

###### blockIdentifier

`"pre_confirmed"`

##### Returns

`Promise`\<\{ `block_hash`: `never`; `state_diff`: \{ `storage_diffs`: `object`[]; `deprecated_declared_classes`: `string`[]; `declared_classes`: `object`[]; `deployed_contracts`: `object`[]; `replaced_classes`: `object`[]; `nonces`: `object`[]; `migrated_compiled_classes?`: `object`[]; \}; `old_root?`: `string`; \}\>

#### Call Signature

> (`blockIdentifier`): `Promise`\<\{ `block_hash`: `string`; `new_root`: `string`; `old_root`: `string`; `state_diff`: \{ `storage_diffs`: `object`[]; `deprecated_declared_classes`: `string`[]; `declared_classes`: `object`[]; `deployed_contracts`: `object`[]; `replaced_classes`: `object`[]; `nonces`: `object`[]; `migrated_compiled_classes?`: `object`[]; \}; \}\>

##### Parameters

###### blockIdentifier

`"latest"`

##### Returns

`Promise`\<\{ `block_hash`: `string`; `new_root`: `string`; `old_root`: `string`; `state_diff`: \{ `storage_diffs`: `object`[]; `deprecated_declared_classes`: `string`[]; `declared_classes`: `object`[]; `deployed_contracts`: `object`[]; `replaced_classes`: `object`[]; `nonces`: `object`[]; `migrated_compiled_classes?`: `object`[]; \}; \}\>

#### Call Signature

> (`blockIdentifier?`): `Promise`\<`StateUpdateResponse`\>

##### Parameters

###### blockIdentifier?

`BlockIdentifier`

##### Returns

`Promise`\<`StateUpdateResponse`\>

#### Param

block identifier

#### Returns

StateUpdateResponse

#### Inherited from

`RpcProvider_base.getStateUpdate`

## Methods

### fetch()

> **fetch**(`method`, `params?`, `id?`): `Promise`\<`Response`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4766

Direct RPC method call

#### Parameters

##### method

`string`

RPC method name

##### params?

`object`

method parameters

##### id?

request ID

`string` | `number`

#### Returns

`Promise`\<`Response`\>

RPC response

#### Inherited from

`RpcProvider_base.fetch`

***

### getChainId()

> **getChainId**(): `Promise`\<`"0x534e5f4d41494e"` \| `"0x534e5f5345504f4c4941"`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4767

Gets the Starknet chain Id

#### Returns

`Promise`\<`"0x534e5f4d41494e"` \| `"0x534e5f5345504f4c4941"`\>

the chain Id

#### Inherited from

`RpcProvider_base.getChainId`

***

### readSpecVersion()

> **readSpecVersion**(): `"0.9.0"` \| `"0.10.0"` \| `undefined`

Defined in: node\_modules/starknet/dist/index.d.ts:4768

Read channel spec version

#### Returns

`"0.9.0"` \| `"0.10.0"` \| `undefined`

Spec version string or undefined if not set

#### Inherited from

`RpcProvider_base.readSpecVersion`

***

### getSpecVersion()

> **getSpecVersion**(): `Promise`\<`string`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4769

Get channel spec version

#### Returns

`Promise`\<`string`\>

Promise resolving to spec version

#### Inherited from

`RpcProvider_base.getSpecVersion`

***

### setUpSpecVersion()

> **setUpSpecVersion**(): `Promise`\<`"0.9.0"` \| `"0.10.0"`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4770

Setup channel spec version and return it

#### Returns

`Promise`\<`"0.9.0"` \| `"0.10.0"`\>

Promise resolving to spec version

#### Inherited from

`RpcProvider_base.setUpSpecVersion`

***

### getStarknetVersion()

> **getStarknetVersion**(`blockIdentifier?`): `Promise`\<`string`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4771

#### Parameters

##### blockIdentifier?

`BlockIdentifier`

#### Returns

`Promise`\<`string`\>

#### Inherited from

`RpcProvider_base.getStarknetVersion`

***

### getNonceForAddress()

> **getNonceForAddress**(`contractAddress`, `blockIdentifier?`): `Promise`\<`string`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4772

Returns the nonce associated with the given address in the given block

#### Parameters

##### contractAddress

`BigNumberish`

contract address

##### blockIdentifier?

`BlockIdentifier`

#### Returns

`Promise`\<`string`\>

the hex nonce

#### Inherited from

`RpcProvider_base.getNonceForAddress`

***

### getBlock()

#### Call Signature

> **getBlock**(): `Promise`\<\{ `transactions`: `string`[]; `block_number`: `number`; `timestamp`: `number`; `sequencer_address`: `string`; `l1_gas_price`: `RESOURCE_PRICE`; `l2_gas_price`: `RESOURCE_PRICE`; `l1_data_gas_price`: `RESOURCE_PRICE`; `l1_da_mode`: `L1_DA_MODE`; `starknet_version`: `string`; \}\>

Defined in: node\_modules/starknet/dist/index.d.ts:4773

Gets the block information

##### Returns

`Promise`\<\{ `transactions`: `string`[]; `block_number`: `number`; `timestamp`: `number`; `sequencer_address`: `string`; `l1_gas_price`: `RESOURCE_PRICE`; `l2_gas_price`: `RESOURCE_PRICE`; `l1_data_gas_price`: `RESOURCE_PRICE`; `l1_da_mode`: `L1_DA_MODE`; `starknet_version`: `string`; \}\>

the block object

##### Inherited from

`RpcProvider_base.getBlock`

#### Call Signature

> **getBlock**(`blockIdentifier`): `Promise`\<\{ `transactions`: `string`[]; `block_number`: `number`; `timestamp`: `number`; `sequencer_address`: `string`; `l1_gas_price`: `RESOURCE_PRICE`; `l2_gas_price`: `RESOURCE_PRICE`; `l1_data_gas_price`: `RESOURCE_PRICE`; `l1_da_mode`: `L1_DA_MODE`; `starknet_version`: `string`; \}\>

Defined in: node\_modules/starknet/dist/index.d.ts:4774

##### Parameters

###### blockIdentifier

`"pre_confirmed"`

##### Returns

`Promise`\<\{ `transactions`: `string`[]; `block_number`: `number`; `timestamp`: `number`; `sequencer_address`: `string`; `l1_gas_price`: `RESOURCE_PRICE`; `l2_gas_price`: `RESOURCE_PRICE`; `l1_data_gas_price`: `RESOURCE_PRICE`; `l1_da_mode`: `L1_DA_MODE`; `starknet_version`: `string`; \}\>

##### Inherited from

`RpcProvider_base.getBlock`

#### Call Signature

> **getBlock**(`blockIdentifier`): `Promise`\<\{ `transactions`: `string`[]; `block_hash`: `string`; `parent_hash`: `string`; `block_number`: `number`; `new_root`: `string`; `timestamp`: `number`; `sequencer_address`: `string`; `l1_gas_price`: `RESOURCE_PRICE`; `l2_gas_price`: `RESOURCE_PRICE`; `l1_data_gas_price`: `RESOURCE_PRICE`; `l1_da_mode`: `L1_DA_MODE`; `starknet_version`: `string`; `event_commitment`: `string`; `transaction_commitment`: `string`; `receipt_commitment`: `string`; `state_diff_commitment`: `string`; `event_count`: `number`; `transaction_count`: `number`; `state_diff_length`: `number`; `status`: `EBlockStatus`; \}\>

Defined in: node\_modules/starknet/dist/index.d.ts:4775

##### Parameters

###### blockIdentifier

`"latest"`

##### Returns

`Promise`\<\{ `transactions`: `string`[]; `block_hash`: `string`; `parent_hash`: `string`; `block_number`: `number`; `new_root`: `string`; `timestamp`: `number`; `sequencer_address`: `string`; `l1_gas_price`: `RESOURCE_PRICE`; `l2_gas_price`: `RESOURCE_PRICE`; `l1_data_gas_price`: `RESOURCE_PRICE`; `l1_da_mode`: `L1_DA_MODE`; `starknet_version`: `string`; `event_commitment`: `string`; `transaction_commitment`: `string`; `receipt_commitment`: `string`; `state_diff_commitment`: `string`; `event_count`: `number`; `transaction_count`: `number`; `state_diff_length`: `number`; `status`: `EBlockStatus`; \}\>

##### Inherited from

`RpcProvider_base.getBlock`

#### Call Signature

> **getBlock**(`blockIdentifier`): `Promise`\<`GetBlockResponse`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4776

##### Parameters

###### blockIdentifier

`BlockIdentifier`

##### Returns

`Promise`\<`GetBlockResponse`\>

##### Inherited from

`RpcProvider_base.getBlock`

***

### getBlockLatestAccepted()

> **getBlockLatestAccepted**(): `Promise`\<`BlockHashAndNumber`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4777

Get the most recent accepted block hash and number

#### Returns

`Promise`\<`BlockHashAndNumber`\>

Object containing block hash and number

#### Inherited from

`RpcProvider_base.getBlockLatestAccepted`

***

### getBlockNumber()

> **getBlockNumber**(): `Promise`\<`number`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4778

Get the most recent accepted block number

#### Returns

`Promise`\<`number`\>

Number of the latest block

#### Inherited from

`RpcProvider_base.getBlockNumber`

***

### getBlockWithTxHashes()

> **getBlockWithTxHashes**(`blockIdentifier?`): `Promise`\<`object` & `BLOCK_HEADER` & `BLOCK_BODY_WITH_TX_HASHES` \| `BLOCK_BODY_WITH_TX_HASHES` & `PRE_CONFIRMED_BLOCK_HEADER` & `object`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4779

Get block information with transaction hashes

#### Parameters

##### blockIdentifier?

`BlockIdentifier`

block identifier

#### Returns

`Promise`\<`object` & `BLOCK_HEADER` & `BLOCK_BODY_WITH_TX_HASHES` \| `BLOCK_BODY_WITH_TX_HASHES` & `PRE_CONFIRMED_BLOCK_HEADER` & `object`\>

Block with transaction hashes

#### Inherited from

`RpcProvider_base.getBlockWithTxHashes`

***

### getBlockWithTxs()

> **getBlockWithTxs**(`blockIdentifier?`): `Promise`\<`object` & `BLOCK_HEADER` & `BLOCK_BODY_WITH_TXS` \| `BLOCK_BODY_WITH_TXS` & `PRE_CONFIRMED_BLOCK_HEADER` & `object`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4787

Get block information with full transactions

#### Parameters

##### blockIdentifier?

`BlockIdentifier`

block identifier

#### Returns

`Promise`\<`object` & `BLOCK_HEADER` & `BLOCK_BODY_WITH_TXS` \| `BLOCK_BODY_WITH_TXS` & `PRE_CONFIRMED_BLOCK_HEADER` & `object`\>

Block with full transactions

#### Inherited from

`RpcProvider_base.getBlockWithTxs`

***

### waitForBlock()

> **waitForBlock**(`blockIdentifier?`, `retryInterval?`): `Promise`\<`void`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4795

Pause execution until a specified block is created

#### Parameters

##### blockIdentifier?

`BlockIdentifier`

block number or tag

##### retryInterval?

`number`

milliseconds between requests (default: 5000)

#### Returns

`Promise`\<`void`\>

#### Example

```typescript
await provider.waitForBlock(12345);
await provider.waitForBlock('latest');
```

#### Inherited from

`RpcProvider_base.waitForBlock`

***

### getL1GasPrice()

> **getL1GasPrice**(`blockIdentifier?`): `Promise`\<`string`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4796

Gets the price of l1 gas in the block

#### Parameters

##### blockIdentifier?

`BlockIdentifier`

block identifier

#### Returns

`Promise`\<`string`\>

gas price of the block

#### Inherited from

`RpcProvider_base.getL1GasPrice`

***

### getGasPrices()

> **getGasPrices**(`blockIdentifier?`): `Promise`\<`GasPrices`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4807

Get the gas prices related to a block.

#### Parameters

##### blockIdentifier?

`BlockIdentifier`

#### Returns

`Promise`\<`GasPrices`\>

an object with l1DataGasPrice, l1GasPrice, l2GasPrice properties (all bigint type).

#### Example

```ts
const result = await myProvider.getGasPrices();
// result = { l1DataGasPrice: 3039n, l1GasPrice: 55590341542890n, l2GasPrice: 8441845008n }
```

#### Inherited from

`RpcProvider_base.getGasPrices`

***

### getL1MessageHash()

> **getL1MessageHash**(`l2TxHash`): `Promise`\<`string`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4808

Get L1 message hash from L2 transaction hash

#### Parameters

##### l2TxHash

`BigNumberish`

L2 transaction hash

#### Returns

`Promise`\<`string`\>

Hex string of L1 message hash

#### Example

In Sepolia Testnet :
```typescript
const result = provider.getL1MessageHash('0x28dfc05eb4f261b37ddad451ff22f1d08d4e3c24dc646af0ec69fa20e096819');
// result = '0x55b3f8b6e607fffd9b4d843dfe8f9b5c05822cd94fcad8797deb01d77805532a'
```

#### Inherited from

`RpcProvider_base.getL1MessageHash`

***

### getBlockWithReceipts()

> **getBlockWithReceipts**(`blockIdentifier?`): `Promise`\<`object` & `BLOCK_HEADER` & `BLOCK_BODY_WITH_RECEIPTS` \| `BLOCK_BODY_WITH_RECEIPTS` & `PRE_CONFIRMED_BLOCK_HEADER` & `object`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4809

Get block information with transaction receipts

#### Parameters

##### blockIdentifier?

`BlockIdentifier`

block identifier

#### Returns

`Promise`\<`object` & `BLOCK_HEADER` & `BLOCK_BODY_WITH_RECEIPTS` \| `BLOCK_BODY_WITH_RECEIPTS` & `PRE_CONFIRMED_BLOCK_HEADER` & `object`\>

Block with transaction receipts

#### Inherited from

`RpcProvider_base.getBlockWithReceipts`

***

### getBlockStateUpdate()

#### Call Signature

> **getBlockStateUpdate**(): `Promise`\<\{ `block_hash`: `string`; `new_root`: `string`; `old_root`: `string`; `state_diff`: \{ `storage_diffs`: `object`[]; `deprecated_declared_classes`: `string`[]; `declared_classes`: `object`[]; `deployed_contracts`: `object`[]; `replaced_classes`: `object`[]; `nonces`: `object`[]; `migrated_compiled_classes?`: `object`[]; \}; \}\>

Defined in: node\_modules/starknet/dist/index.d.ts:4823

Gets the state changes in a specific block (result of executing the requested block)
Alternative method name for getStateUpdate with specific overloads

##### Returns

`Promise`\<\{ `block_hash`: `string`; `new_root`: `string`; `old_root`: `string`; `state_diff`: \{ `storage_diffs`: `object`[]; `deprecated_declared_classes`: `string`[]; `declared_classes`: `object`[]; `deployed_contracts`: `object`[]; `replaced_classes`: `object`[]; `nonces`: `object`[]; `migrated_compiled_classes?`: `object`[]; \}; \}\>

StateUpdateResponse

##### Inherited from

`RpcProvider_base.getBlockStateUpdate`

#### Call Signature

> **getBlockStateUpdate**(`blockIdentifier`): `Promise`\<\{ `block_hash`: `never`; `state_diff`: \{ `storage_diffs`: `object`[]; `deprecated_declared_classes`: `string`[]; `declared_classes`: `object`[]; `deployed_contracts`: `object`[]; `replaced_classes`: `object`[]; `nonces`: `object`[]; `migrated_compiled_classes?`: `object`[]; \}; `old_root?`: `string`; \}\>

Defined in: node\_modules/starknet/dist/index.d.ts:4824

##### Parameters

###### blockIdentifier

`"pre_confirmed"`

##### Returns

`Promise`\<\{ `block_hash`: `never`; `state_diff`: \{ `storage_diffs`: `object`[]; `deprecated_declared_classes`: `string`[]; `declared_classes`: `object`[]; `deployed_contracts`: `object`[]; `replaced_classes`: `object`[]; `nonces`: `object`[]; `migrated_compiled_classes?`: `object`[]; \}; `old_root?`: `string`; \}\>

##### Inherited from

`RpcProvider_base.getBlockStateUpdate`

#### Call Signature

> **getBlockStateUpdate**(`blockIdentifier`): `Promise`\<\{ `block_hash`: `string`; `new_root`: `string`; `old_root`: `string`; `state_diff`: \{ `storage_diffs`: `object`[]; `deprecated_declared_classes`: `string`[]; `declared_classes`: `object`[]; `deployed_contracts`: `object`[]; `replaced_classes`: `object`[]; `nonces`: `object`[]; `migrated_compiled_classes?`: `object`[]; \}; \}\>

Defined in: node\_modules/starknet/dist/index.d.ts:4825

##### Parameters

###### blockIdentifier

`"latest"`

##### Returns

`Promise`\<\{ `block_hash`: `string`; `new_root`: `string`; `old_root`: `string`; `state_diff`: \{ `storage_diffs`: `object`[]; `deprecated_declared_classes`: `string`[]; `declared_classes`: `object`[]; `deployed_contracts`: `object`[]; `replaced_classes`: `object`[]; `nonces`: `object`[]; `migrated_compiled_classes?`: `object`[]; \}; \}\>

##### Inherited from

`RpcProvider_base.getBlockStateUpdate`

#### Call Signature

> **getBlockStateUpdate**(`blockIdentifier?`): `Promise`\<`StateUpdateResponse`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4826

##### Parameters

###### blockIdentifier?

`BlockIdentifier`

##### Returns

`Promise`\<`StateUpdateResponse`\>

##### Inherited from

`RpcProvider_base.getBlockStateUpdate`

***

### getBlockTransactionsTraces()

> **getBlockTransactionsTraces**(`blockIdentifier?`): `Promise`\<`BlockTransactionsTraces`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4827

Get transaction traces for all transactions in a block

#### Parameters

##### blockIdentifier?

`BlockIdentifier`

block identifier

#### Returns

`Promise`\<`BlockTransactionsTraces`\>

Array of transaction traces

#### Inherited from

`RpcProvider_base.getBlockTransactionsTraces`

***

### getBlockTransactionCount()

> **getBlockTransactionCount**(`blockIdentifier?`): `Promise`\<`number`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4828

Get the number of transactions in a block

#### Parameters

##### blockIdentifier?

`BlockIdentifier`

block identifier

#### Returns

`Promise`\<`number`\>

Transaction count

#### Inherited from

`RpcProvider_base.getBlockTransactionCount`

***

### getTransaction()

> **getTransaction**(`txHash`): `Promise`\<`TXN_WITH_HASH`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4829

Gets the transaction information from a tx id.

#### Parameters

##### txHash

`BigNumberish`

#### Returns

`Promise`\<`TXN_WITH_HASH`\>

the transaction object { transaction_id, status, transaction, block_number?, block_number?, transaction_index?, transaction_failure_reason? }

#### Inherited from

`RpcProvider_base.getTransaction`

***

### getTransactionByHash()

> **getTransactionByHash**(`txHash`): `Promise`\<`TXN_WITH_HASH`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4830

Gets the transaction information from a tx hash (alias for getTransaction)

#### Parameters

##### txHash

`BigNumberish`

transaction hash

#### Returns

`Promise`\<`TXN_WITH_HASH`\>

Transaction information

#### Inherited from

`RpcProvider_base.getTransactionByHash`

***

### getTransactionByBlockIdAndIndex()

> **getTransactionByBlockIdAndIndex**(`blockIdentifier`, `index`): `Promise`\<`TXN_WITH_HASH`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4831

Gets transaction by block identifier and index

#### Parameters

##### blockIdentifier

`BlockIdentifier`

block identifier

##### index

`number`

transaction index in the block

#### Returns

`Promise`\<`TXN_WITH_HASH`\>

Transaction information

#### Inherited from

`RpcProvider_base.getTransactionByBlockIdAndIndex`

***

### getTransactionReceipt()

> **getTransactionReceipt**(`txHash`): `Promise`\<[`TxReceipt`](../type-aliases/TxReceipt.md)\>

Defined in: node\_modules/starknet/dist/index.d.ts:4832

Gets the transaction receipt from a tx hash.

#### Parameters

##### txHash

`BigNumberish`

#### Returns

`Promise`\<[`TxReceipt`](../type-aliases/TxReceipt.md)\>

the transaction receipt object

#### Inherited from

`RpcProvider_base.getTransactionReceipt`

***

### getTransactionTrace()

> **getTransactionTrace**(`txHash`): `Promise`\<`TRANSACTION_TRACE` \| `TRANSACTION_TRACE`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4833

Gets the transaction trace

#### Parameters

##### txHash

`BigNumberish`

transaction hash

#### Returns

`Promise`\<`TRANSACTION_TRACE` \| `TRANSACTION_TRACE`\>

Transaction trace

#### Inherited from

`RpcProvider_base.getTransactionTrace`

***

### getTransactionStatus()

> **getTransactionStatus**(`transactionHash`): `Promise`\<`TXN_STATUS_RESULT`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4834

Get the status of a transaction

#### Parameters

##### transactionHash

`BigNumberish`

transaction hash

#### Returns

`Promise`\<`TXN_STATUS_RESULT`\>

Transaction status

#### Inherited from

`RpcProvider_base.getTransactionStatus`

***

### getSimulateTransaction()

> **getSimulateTransaction**(`invocations`, `options?`): `Promise`\<`SimulateTransactionOverheadResponse`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4835

Simulates the transaction and returns the transaction trace and estimated fee.

#### Parameters

##### invocations

`AccountInvocations`

AccountInvocations - Complete invocations array with account details

##### options?

`getSimulateTransactionOptions`

getSimulateTransactionOptions
 - (optional) blockIdentifier - block identifier
 - (optional) skipValidate - skip cairo __validate__ method
 - (optional) skipExecute - skip cairo __execute__ method

#### Returns

`Promise`\<`SimulateTransactionOverheadResponse`\>

an array of transaction trace and estimated fee

#### Inherited from

`RpcProvider_base.getSimulateTransaction`

***

### waitForTransaction()

> **waitForTransaction**(`txHash`, `options?`): `Promise`\<[`TxReceipt`](../type-aliases/TxReceipt.md)\>

Defined in: node\_modules/starknet/dist/index.d.ts:4836

Wait for the transaction to be accepted

#### Parameters

##### txHash

`BigNumberish`

transaction hash

##### options?

[`WaitOptions`](../type-aliases/WaitOptions.md)

waitForTransactionOptions
- (optional) retryInterval: number | undefined;
- (optional) successStates: TransactionStatus[] | undefined;

#### Returns

`Promise`\<[`TxReceipt`](../type-aliases/TxReceipt.md)\>

GetTransactionReceiptResponse

#### Inherited from

`RpcProvider_base.waitForTransaction`

***

### fastWaitForTransaction()

> **fastWaitForTransaction**(`txHash`, `address`, `initNonce`, `options?`): `Promise`\<`boolean`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4850

Wait up until a new transaction is possible with same the account.
This method is fast, but Events and transaction report are not yet
available. Useful for gaming activity.
- only rpc 0.9 and onwards.

#### Parameters

##### txHash

`BigNumberish`

transaction hash

##### address

`string`

address of the account

##### initNonce

`BigNumberish`

initial nonce of the account (before the transaction).

##### options?

`fastWaitForTransactionOptions`

options to scan the network for the next possible transaction. `retries` is the number of times to retry.

#### Returns

`Promise`\<`boolean`\>

Returns true if the next transaction is possible,
false if the timeout has been reached,
throw an error in case of provider communication.

#### Inherited from

`RpcProvider_base.fastWaitForTransaction`

***

### getStorageAt()

> **getStorageAt**(`contractAddress`, `key`, `blockIdentifier?`): `Promise`\<`string`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4851

Get the value of the storage (contract's variable) at the given address and key

#### Parameters

##### contractAddress

`BigNumberish`

##### key

`BigNumberish`

from getStorageVarAddress('<STORAGE_VARIABLE_NAME>') (WIP)

##### blockIdentifier?

`BlockIdentifier`

block identifier

#### Returns

`Promise`\<`string`\>

the value of the storage variable

#### Inherited from

`RpcProvider_base.getStorageAt`

***

### getClassHashAt()

> **getClassHashAt**(`contractAddress`, `blockIdentifier?`): `Promise`\<`string`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4852

Returns the contract class hash in the given block for the contract deployed at the given address

#### Parameters

##### contractAddress

`BigNumberish`

contract address

##### blockIdentifier?

`BlockIdentifier`

block identifier

#### Returns

`Promise`\<`string`\>

Class hash

#### Inherited from

`RpcProvider_base.getClassHashAt`

***

### getClassByHash()

> **getClassByHash**(`classHash`): `Promise`\<`LegacyContractClass` \| `Omit`\<`CompiledSierra`, `"sierra_program_debug_info"`\>\>

Defined in: node\_modules/starknet/dist/index.d.ts:4853

Returns the contract class deployed under the given class hash.

#### Parameters

##### classHash

`BigNumberish`

class hash

#### Returns

`Promise`\<`LegacyContractClass` \| `Omit`\<`CompiledSierra`, `"sierra_program_debug_info"`\>\>

Contract class of compiled contract

#### Inherited from

`RpcProvider_base.getClassByHash`

***

### getClass()

> **getClass**(`classHash`, `blockIdentifier?`): `Promise`\<`LegacyContractClass` \| `Omit`\<`CompiledSierra`, `"sierra_program_debug_info"`\>\>

Defined in: node\_modules/starknet/dist/index.d.ts:4854

Get contract class by hash with optional block identifier

#### Parameters

##### classHash

`BigNumberish`

class hash

##### blockIdentifier?

`BlockIdentifier`

block identifier

#### Returns

`Promise`\<`LegacyContractClass` \| `Omit`\<`CompiledSierra`, `"sierra_program_debug_info"`\>\>

Contract class

#### Inherited from

`RpcProvider_base.getClass`

***

### getClassAt()

> **getClassAt**(`contractAddress`, `blockIdentifier?`): `Promise`\<`LegacyContractClass` \| `Omit`\<`CompiledSierra`, `"sierra_program_debug_info"`\>\>

Defined in: node\_modules/starknet/dist/index.d.ts:4855

Gets the contract class of the deployed contract.

#### Parameters

##### contractAddress

`BigNumberish`

contract address

##### blockIdentifier?

`BlockIdentifier`

block identifier

#### Returns

`Promise`\<`LegacyContractClass` \| `Omit`\<`CompiledSierra`, `"sierra_program_debug_info"`\>\>

Contract class of compiled contract

#### Inherited from

`RpcProvider_base.getClassAt`

***

### getContractVersion()

#### Call Signature

> **getContractVersion**(`contractAddress`, `classHash?`, `options?`): `Promise`\<`ContractVersion`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4856

Gets the contract version from the provided address

##### Parameters

###### contractAddress

`BigNumberish`

string

###### classHash?

`undefined`

undefined

###### options?

`getContractVersionOptions`

getContractVersionOptions
  - (optional) compiler - (default true) extract compiler version using type tactic from abi
  - (optional) blockIdentifier - block identifier

##### Returns

`Promise`\<`ContractVersion`\>

##### Inherited from

`RpcProvider_base.getContractVersion`

#### Call Signature

> **getContractVersion**(`contractAddress`, `classHash`, `options?`): `Promise`\<`ContractVersion`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4857

Gets the contract version from the provided address

##### Parameters

###### contractAddress

`undefined`

undefined

###### classHash

`BigNumberish`

###### options?

`getContractVersionOptions`

getContractVersionOptions
  - (optional) compiler - (default true) extract compiler version using type tactic from abi
  - (optional) blockIdentifier - block identifier

##### Returns

`Promise`\<`ContractVersion`\>

##### Inherited from

`RpcProvider_base.getContractVersion`

***

### ~~getInvokeEstimateFee()~~

> **getInvokeEstimateFee**(`invocation`, `details`, `blockIdentifier?`, `skipValidate?`): `Promise`\<`EstimateFeeResponseOverhead`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4858

Estimates the fee for a given INVOKE transaction

#### Parameters

##### invocation

`Invocation`

the invocation object containing:
- contractAddress - the address of the contract
- entrypoint - (optional) the entrypoint of the contract
- calldata - (optional, defaults to []) the calldata
- signature - (optional, defaults to []) the signature

##### details

`InvocationsDetailsWithNonce`

optional details containing:
- nonce - optional nonce
- version - optional version

##### blockIdentifier?

`BlockIdentifier`

(optional) block identifier

##### skipValidate?

`boolean`

(optional) skip cairo __validate__ method

#### Returns

`Promise`\<`EstimateFeeResponseOverhead`\>

the estimated fee

#### Deprecated

Consider using getEstimateFeeBulk for multiple transactions

#### Example

```typescript
const feeEstimate = await provider.getInvokeEstimateFee(invocation, details);
// Equivalent to:
const [feeEstimate] = await provider.getEstimateFeeBulk([{ type: ETransactionType.INVOKE, ...invocation, ...details }], options);
```

#### Alias

getEstimateFeeBulk - This method is an alias that calls getEstimateFeeBulk with a single transaction

#### Inherited from

`RpcProvider_base.getInvokeEstimateFee`

***

### ~~getDeclareEstimateFee()~~

> **getDeclareEstimateFee**(`invocation`, `details`, `blockIdentifier?`, `skipValidate?`): `Promise`\<`EstimateFeeResponseOverhead`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4859

Estimates the fee for a given DECLARE transaction

#### Parameters

##### invocation

`DeclareContractTransaction`

##### details

`InvocationsDetailsWithNonce`

optional details containing:
- nonce
- version - optional version
- optional maxFee

##### blockIdentifier?

`BlockIdentifier`

(optional) block identifier

##### skipValidate?

`boolean`

(optional) skip cairo __validate__ method

#### Returns

`Promise`\<`EstimateFeeResponseOverhead`\>

the estimated fee

#### Deprecated

Consider using getEstimateFeeBulk for multiple transactions

#### Example

```typescript
const feeEstimate = await provider.getDeclareEstimateFee(transaction, details);
// Equivalent to:
const [feeEstimate] = await provider.getEstimateFeeBulk([{ type: ETransactionType.DECLARE, ...transaction, ...details }], options);
```

#### Alias

getEstimateFeeBulk - This method is an alias that calls getEstimateFeeBulk with a single transaction

#### Inherited from

`RpcProvider_base.getDeclareEstimateFee`

***

### ~~getDeployAccountEstimateFee()~~

> **getDeployAccountEstimateFee**(`invocation`, `details`, `blockIdentifier?`, `skipValidate?`): `Promise`\<`EstimateFeeResponseOverhead`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4860

Estimates the fee for a given DEPLOY_ACCOUNT transaction

#### Parameters

##### invocation

`DeployAccountContractTransaction`

##### details

`InvocationsDetailsWithNonce`

optional details containing:
- nonce
- version - optional version
- optional maxFee

##### blockIdentifier?

`BlockIdentifier`

(optional) block identifier

##### skipValidate?

`boolean`

(optional) skip cairo __validate__ method

#### Returns

`Promise`\<`EstimateFeeResponseOverhead`\>

the estimated fee

#### Deprecated

Consider using getEstimateFeeBulk for multiple transactions

#### Example

```typescript
const feeEstimate = await provider.getDeployAccountEstimateFee(transaction, details);
// Equivalent to:
const [feeEstimate] = await provider.getEstimateFeeBulk([{ type: ETransactionType.DEPLOY_ACCOUNT, ...transaction, ...details }], options);
```

#### Alias

getEstimateFeeBulk - This method is an alias that calls getEstimateFeeBulk with a single transaction

#### Inherited from

`RpcProvider_base.getDeployAccountEstimateFee`

***

### getEstimateFeeBulk()

> **getEstimateFeeBulk**(`invocations`, `options?`): `Promise`\<`EstimateFeeResponseBulkOverhead`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4861

Estimates the fee for a list of INVOKE transaction

#### Parameters

##### invocations

`AccountInvocations`

AccountInvocations - Complete invocations array with account details

##### options?

`getEstimateFeeBulkOptions`

getEstimateFeeBulkOptions
- (optional) blockIdentifier - BlockIdentifier

#### Returns

`Promise`\<`EstimateFeeResponseBulkOverhead`\>

the estimated fee

#### Inherited from

`RpcProvider_base.getEstimateFeeBulk`

***

### invokeFunction()

> **invokeFunction**(`functionInvocation`, `details`): `Promise`\<\{ `transaction_hash`: `string`; \}\>

Defined in: node\_modules/starknet/dist/index.d.ts:4862

Invokes a function on starknet

#### Parameters

##### functionInvocation

`Invocation`

##### details

`InvocationsDetailsWithNonce`

optional details containing:
- nonce - optional nonce
- version - optional version
- maxFee - optional maxFee

#### Returns

`Promise`\<\{ `transaction_hash`: `string`; \}\>

response from addTransaction

#### Inherited from

`RpcProvider_base.invokeFunction`

***

### declareContract()

> **declareContract**(`transaction`, `details`): `Promise`\<\{ `class_hash`: `string`; `transaction_hash`: `string`; \}\>

Defined in: node\_modules/starknet/dist/index.d.ts:4865

Declares a given compiled contract (json) to starknet

#### Parameters

##### transaction

`DeclareContractTransaction`

transaction payload to be deployed containing:
- compiled contract code
- sender address
- signature

##### details

`InvocationsDetailsWithNonce`

Invocation Details containing:
- nonce
- optional version
- optional maxFee

#### Returns

`Promise`\<\{ `class_hash`: `string`; `transaction_hash`: `string`; \}\>

a confirmation of sending a transaction on the starknet contract

#### Inherited from

`RpcProvider_base.declareContract`

***

### deployAccountContract()

> **deployAccountContract**(`transaction`, `details`): `Promise`\<\{ `contract_address`: `string`; `transaction_hash`: `string`; \}\>

Defined in: node\_modules/starknet/dist/index.d.ts:4869

Deploys a given compiled Account contract (json) to starknet

#### Parameters

##### transaction

`DeployAccountContractTransaction`

##### details

`InvocationsDetailsWithNonce`

#### Returns

`Promise`\<\{ `contract_address`: `string`; `transaction_hash`: `string`; \}\>

a confirmation of sending a transaction on the starknet contract

#### Inherited from

`RpcProvider_base.deployAccountContract`

***

### callContract()

> **callContract**(`call`, `blockIdentifier?`): `Promise`\<`string`[]\>

Defined in: node\_modules/starknet/dist/index.d.ts:4873

Calls a function on the Starknet contract.

#### Parameters

##### call

[`Call`](../type-aliases/Call.md)

transaction to be called

##### blockIdentifier?

`BlockIdentifier`

block identifier

#### Returns

`Promise`\<`string`[]\>

the result of the function on the smart contract.

#### Inherited from

`RpcProvider_base.callContract`

***

### estimateMessageFee()

> **estimateMessageFee**(`message`, `blockIdentifier?`): `Promise`\<`FEE_ESTIMATE` \| `MESSAGE_FEE_ESTIMATE`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4874

Estimate the fee for a message from L1

#### Parameters

##### message

`MSG_FROM_L1`

L1 message

##### blockIdentifier?

`BlockIdentifier`

block identifier

#### Returns

`Promise`\<`FEE_ESTIMATE` \| `MESSAGE_FEE_ESTIMATE`\>

Fee estimate

#### Inherited from

`RpcProvider_base.estimateMessageFee`

***

### getSyncingStats()

> **getSyncingStats**(): `Promise`\<`Syncing`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4876

Get node synchronization status

#### Returns

`Promise`\<`Syncing`\>

Sync status or false if not syncing

#### Inherited from

`RpcProvider_base.getSyncingStats`

***

### getEvents()

> **getEvents**(`eventFilter`): `Promise`\<`EVENTS_CHUNK` \| `EVENTS_CHUNK`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4877

Get events matching the given filter

#### Parameters

##### eventFilter

event filter

`EventFilter` | `EventFilter`

#### Returns

`Promise`\<`EVENTS_CHUNK` \| `EVENTS_CHUNK`\>

Events and pagination info

#### Inherited from

`RpcProvider_base.getEvents`

***

### verifyMessageInStarknet()

> **verifyMessageInStarknet**(`message`, `signature`, `accountAddress`, `signatureVerificationFunctionName?`, `signatureVerificationResponse?`): `Promise`\<`boolean`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4878

Verify in Starknet a signature of a TypedData object or of a given hash.

#### Parameters

##### message

TypedData object to be verified, or message hash to be verified.

`BigNumberish` | `TypedData`

##### signature

`Signature`

signature of the message.

##### accountAddress

`BigNumberish`

address of the account that has signed the message.

##### signatureVerificationFunctionName?

`string`

if account contract with non standard account verification function name.

##### signatureVerificationResponse?

if account contract with non standard response of verification function.

###### okResponse

`string`[]

###### nokResponse

`string`[]

###### error

`string`[]

#### Returns

`Promise`\<`boolean`\>

```typescript
const myTypedMessage: TypedMessage = .... ;
const messageHash = typedData.getMessageHash(myTypedMessage,accountAddress);
const sign: WeierstrassSignatureType = ec.starkCurve.sign(messageHash, privateKey);
const accountAddress = "0x43b7240d227aa2fb8434350b3321c40ac1b88c7067982549e7609870621b535";
const result1 = await myRpcProvider.verifyMessageInStarknet(myTypedMessage, sign, accountAddress);
const result2 = await myRpcProvider.verifyMessageInStarknet(messageHash, sign, accountAddress);
// result1 = result2 = true
```

#### Inherited from

`RpcProvider_base.verifyMessageInStarknet`

***

### isClassDeclared()

> **isClassDeclared**(`contractClassIdentifier`, `blockIdentifier?`): `Promise`\<`boolean`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4883

Test if class is already declared

#### Parameters

##### contractClassIdentifier

`ContractClassIdentifier`

contract class identifier

##### blockIdentifier?

`BlockIdentifier`

block identifier

#### Returns

`Promise`\<`boolean`\>

true if class is declared

#### Inherited from

`RpcProvider_base.isClassDeclared`

***

### prepareInvocations()

> **prepareInvocations**(`invocations`): `Promise`\<`Invocations`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4884

Build bulk invocations with auto-detect declared class

#### Parameters

##### invocations

`Invocations`

array of invocations

#### Returns

`Promise`\<`Invocations`\>

Prepared invocations

#### Inherited from

`RpcProvider_base.prepareInvocations`

***

### getL1MessagesStatus()

> **getL1MessagesStatus**(`transactionHash`): `Promise`\<`L1L2MessagesStatus` \| `L1L2MessagesStatus`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4885

Get L1 messages status for a transaction

#### Parameters

##### transactionHash

`BigNumberish`

L1 transaction hash

#### Returns

`Promise`\<`L1L2MessagesStatus` \| `L1L2MessagesStatus`\>

L1 message status

#### Inherited from

`RpcProvider_base.getL1MessagesStatus`

***

### getStorageProof()

> **getStorageProof**(`classHashes`, `contractAddresses`, `contractsStorageKeys`, `blockIdentifier?`): `Promise`\<`StorageProof`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4886

Get Merkle paths in state tries

#### Parameters

##### classHashes

`BigNumberish`[]

class hashes

##### contractAddresses

`BigNumberish`[]

contract addresses

##### contractsStorageKeys

`CONTRACT_STORAGE_KEYS`[]

storage keys

##### blockIdentifier?

`BlockIdentifier`

block identifier

#### Returns

`Promise`\<`StorageProof`\>

Storage proof

#### Inherited from

`RpcProvider_base.getStorageProof`

***

### getCompiledCasm()

> **getCompiledCasm**(`classHash`): `Promise`\<`CASM_COMPILED_CONTRACT_CLASS`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4887

Get compiled CASM contract class

#### Parameters

##### classHash

`BigNumberish`

class hash

#### Returns

`Promise`\<`CASM_COMPILED_CONTRACT_CLASS`\>

Compiled CASM contract class

#### Inherited from

`RpcProvider_base.getCompiledCasm`

***

### getEstimateTip()

> **getEstimateTip**(`blockIdentifier?`, `options?`): `Promise`\<`TipEstimate`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4888

Get transaction tip estimation based on network analysis

#### Parameters

##### blockIdentifier?

`BlockIdentifier`

block identifier to analyze from

##### options?

`TipAnalysisOptions`

tip analysis options

#### Returns

`Promise`\<`TipEstimate`\>

Tip estimation with statistics

#### Example

```typescript
const tipEstimate = await provider.getEstimateTip('latest', {
  maxBlocks: 10,
  minTxsNecessary: 5
});
console.log('Recommended tip:', tipEstimate.recommendedTip);
```

#### Inherited from

`RpcProvider_base.getEstimateTip`

***

### getStarkName()

> **getStarkName**(`address`, `StarknetIdContract?`): `Promise`\<`string`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4892

#### Parameters

##### address

`BigNumberish`

##### StarknetIdContract?

`string`

#### Returns

`Promise`\<`string`\>

#### Inherited from

`RpcProvider_base.getStarkName`

***

### getAddressFromStarkName()

> **getAddressFromStarkName**(`name`, `StarknetIdContract?`): `Promise`\<`string`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4893

#### Parameters

##### name

`string`

##### StarknetIdContract?

`string`

#### Returns

`Promise`\<`string`\>

#### Inherited from

`RpcProvider_base.getAddressFromStarkName`

***

### getStarkProfile()

> **getStarkProfile**(`address`, `StarknetIdContract?`, `StarknetIdIdentityContract?`, `StarknetIdVerifierContract?`, `StarknetIdPfpContract?`, `StarknetIdPopContract?`, `StarknetIdMulticallContract?`): `Promise`\<`StarkProfile`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4894

#### Parameters

##### address

`BigNumberish`

##### StarknetIdContract?

`string`

##### StarknetIdIdentityContract?

`string`

##### StarknetIdVerifierContract?

`string`

##### StarknetIdPfpContract?

`string`

##### StarknetIdPopContract?

`string`

##### StarknetIdMulticallContract?

`string`

#### Returns

`Promise`\<`StarkProfile`\>

#### Inherited from

`RpcProvider_base.getStarkProfile`

***

### getBrotherName()

> **getBrotherName**(`address`, `BrotherIdContract?`): `Promise`\<`string`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4930

Gets the primary Brother domain name for an address

#### Parameters

##### address

`BigNumberish`

The address to get the domain for

##### BrotherIdContract?

`string`

Optional contract address

#### Returns

`Promise`\<`string`\>

The domain name with .brother suffix

#### Inherited from

`RpcProvider_base.getBrotherName`

***

### getAddressFromBrotherName()

> **getAddressFromBrotherName**(`name`, `BrotherIdContract?`): `Promise`\<`string`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4937

Gets the address associated with a Brother domain name

#### Parameters

##### name

`string`

The domain name (with or without .brother suffix)

##### BrotherIdContract?

`string`

Optional contract address

#### Returns

`Promise`\<`string`\>

The resolver address for the domain

#### Inherited from

`RpcProvider_base.getAddressFromBrotherName`

***

### getBrotherProfile()

> **getBrotherProfile**(`address`, `BrotherIdContract?`): `Promise`\<`BrotherProfile`\>

Defined in: node\_modules/starknet/dist/index.d.ts:4944

Gets the complete profile information for a Brother domain

#### Parameters

##### address

`BigNumberish`

The address to get the profile for

##### BrotherIdContract?

`string`

Optional contract address

#### Returns

`Promise`\<`BrotherProfile`\>

The complete Brother profile information

#### Inherited from

`RpcProvider_base.getBrotherProfile`
