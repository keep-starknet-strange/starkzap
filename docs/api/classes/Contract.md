[**starkzap**](../README.md)

***

[starkzap](../globals.md) / Contract

# Class: Contract

Defined in: node\_modules/starknet/dist/index.d.ts:5512

## Implements

- `ContractInterface`

## Indexable

\[`key`: `string`\]: `any`

## Constructors

### Constructor

> **new Contract**(`options`): `Contract`

Defined in: node\_modules/starknet/dist/index.d.ts:5546

#### Parameters

##### options

`ContractOptions`

abi: Abi of the contract object (required)
 - address: address to connect to (required)
 - providerOrAccount?: Provider or Account to attach to (fallback to defaultProvider)
 - parseRequest?: compile and validate arguments (optional, default true)
 - parseResponse?: Parse elements of the response array and structuring them into response object (optional, default true)
 - parser?: Abi parser (optional, default createAbiParser(options.abi))

#### Returns

`Contract`

## Properties

### abi

> **abi**: `Abi`

Defined in: node\_modules/starknet/dist/index.d.ts:5513

Contract ABI (Application Binary Interface)

#### Implementation of

`ContractInterface.abi`

***

### address

> **address**: `string`

Defined in: node\_modules/starknet/dist/index.d.ts:5514

Contract address on Starknet

#### Implementation of

`ContractInterface.address`

***

### providerOrAccount

> **providerOrAccount**: `ProviderOrAccount`

Defined in: node\_modules/starknet/dist/index.d.ts:5515

Provider for read operations or Account for write operations

#### Implementation of

`ContractInterface.providerOrAccount`

***

### classHash?

> `optional` **classHash**: `string`

Defined in: node\_modules/starknet/dist/index.d.ts:5516

Optional contract class hash for optimization

#### Implementation of

`ContractInterface.classHash`

***

### parseRequest

> **parseRequest**: `boolean`

Defined in: node\_modules/starknet/dist/index.d.ts:5517

***

### parseResponse

> **parseResponse**: `boolean`

Defined in: node\_modules/starknet/dist/index.d.ts:5518

***

### functions

> `readonly` **functions**: `object`

Defined in: node\_modules/starknet/dist/index.d.ts:5521

Contract methods that return promises (async operations)

#### Index Signature

\[`name`: `string`\]: `AsyncContractFunction`\<`any`\>

#### Implementation of

`ContractInterface.functions`

***

### callStatic

> `readonly` **callStatic**: `object`

Defined in: node\_modules/starknet/dist/index.d.ts:5524

Contract methods for read-only calls (state queries)

#### Index Signature

\[`name`: `string`\]: `AsyncContractFunction`\<`any`\>

#### Implementation of

`ContractInterface.callStatic`

***

### populateTransaction

> `readonly` **populateTransaction**: `object`

Defined in: node\_modules/starknet/dist/index.d.ts:5527

Contract methods that return populated transactions for batching

#### Index Signature

\[`name`: `string`\]: `ContractFunction`

#### Implementation of

`ContractInterface.populateTransaction`

***

### estimateFee

> `readonly` **estimateFee**: `object`

Defined in: node\_modules/starknet/dist/index.d.ts:5530

Contract methods for fee estimation

#### Index Signature

\[`name`: `string`\]: `ContractFunction`

#### Implementation of

`ContractInterface.estimateFee`

***

### withOptionsProps?

> `optional` **withOptionsProps**: `WithOptions`

Defined in: node\_modules/starknet/dist/index.d.ts:5535

## Methods

### withOptions()

> **withOptions**(`options`): `this`

Defined in: node\_modules/starknet/dist/index.d.ts:5547

Set execution options for subsequent contract interactions

#### Parameters

##### options

`WithOptions`

Options to override for contract interactions

#### Returns

`this`

This contract instance with the specified options applied

#### Example

```typescript
contract.withOptions({
  blockIdentifier: 'latest',
  parseResponse: false
});
// Now all subsequent calls use these options
```

#### Implementation of

`ContractInterface.withOptions`

***

### attach()

> **attach**(`address`, `abi?`): `void`

Defined in: node\_modules/starknet/dist/index.d.ts:5548

Attach the contract to a different address with optional new ABI

#### Parameters

##### address

`string`

New contract address to interact with

##### abi?

`Abi`

Optional new ABI to use (defaults to current ABI)

#### Returns

`void`

#### Example

```typescript
contract.attach('0x123...', newAbi);
// Now contract.address === '0x123...' and uses newAbi
```

#### Implementation of

`ContractInterface.attach`

***

### isDeployed()

> **isDeployed**(): `Promise`\<`Contract`\>

Defined in: node\_modules/starknet/dist/index.d.ts:5549

Verify that a contract is deployed at the current address

#### Returns

`Promise`\<`Contract`\>

Promise resolving to this contract instance if deployed

#### Throws

If no contract is found at the address

#### Example

```typescript
try {
  await contract.isDeployed();
  console.log('Contract is deployed');
} catch (error) {
  console.log('Contract not found at address');
}
```

#### Implementation of

`ContractInterface.isDeployed`

***

### call()

> **call**(`method`, `args?`, `options?`): `Promise`\<`CallResult`\>

Defined in: node\_modules/starknet/dist/index.d.ts:5550

Call a read-only contract method (view function)

#### Parameters

##### method

`string`

Name of the contract method to call

##### args?

`ArgsOrCalldata`

Method arguments as array or calldata

##### options?

`CallOptions`

Call options including block identifier and parsing settings

#### Returns

`Promise`\<`CallResult`\>

Parsed result from the contract method

#### Example

```typescript
const balance = await contract.call('balanceOf', [userAddress]);
const name = await contract.call('name', [], { blockIdentifier: 'latest' });
```

#### Implementation of

`ContractInterface.call`

***

### invoke()

#### Call Signature

> **invoke**(`method`, `args`, `options`): `Promise`\<`SuccessfulTransactionReceiptResponseHelper`\>

Defined in: node\_modules/starknet/dist/index.d.ts:5551

Invoke a state-changing contract method (external function)

##### Parameters

###### method

`string`

Name of the contract method to invoke

###### args

`ArgsOrCalldata`

Method arguments as array or calldata

###### options

`Pick`\<`CommonContractOptions`, `"parseRequest"`\> & `object` & `Partial`\<`UniversalDetails`\> & `object`

Execution options including transaction details

##### Returns

`Promise`\<`SuccessfulTransactionReceiptResponseHelper`\>

Transaction response with hash

##### Example

```typescript
const tx = await contract.invoke('transfer', [recipient, amount]);
const receipt = await provider.waitForTransaction(tx.transaction_hash);
```

##### Implementation of

`ContractInterface.invoke`

#### Call Signature

> **invoke**(`method`, `args`, `options`): `Promise`\<\{ `transaction_hash`: `string`; \}\>

Defined in: node\_modules/starknet/dist/index.d.ts:5554

##### Parameters

###### method

`string`

###### args

`ArgsOrCalldata`

###### options

`Pick`\<`CommonContractOptions`, `"parseRequest"`\> & `object` & `Partial`\<`UniversalDetails`\> & `object`

##### Returns

`Promise`\<\{ `transaction_hash`: `string`; \}\>

##### Implementation of

`ContractInterface.invoke`

#### Call Signature

> **invoke**(`method`, `args?`, `options?`): `Promise`\<\{ `transaction_hash`: `string`; \}\>

Defined in: node\_modules/starknet/dist/index.d.ts:5557

##### Parameters

###### method

`string`

###### args?

`ArgsOrCalldata`

###### options?

`ExecuteOptions`

##### Returns

`Promise`\<\{ `transaction_hash`: `string`; \}\>

##### Implementation of

`ContractInterface.invoke`

***

### estimate()

> **estimate**(`method`, `args?`, `estimateDetails?`): `Promise`\<`EstimateFeeResponseOverhead` \| `PaymasterFeeEstimate`\>

Defined in: node\_modules/starknet/dist/index.d.ts:5558

Estimate fee for invoking a contract method

#### Parameters

##### method

`string`

Name of the contract method to estimate

##### args?

`ArgsOrCalldata`

Method arguments as array or calldata

##### estimateDetails?

`ExecuteOptions`

#### Returns

`Promise`\<`EstimateFeeResponseOverhead` \| `PaymasterFeeEstimate`\>

Fee estimation details

#### Example

```typescript
const feeEstimate = await contract.estimate('transfer', [recipient, amount]);
console.log('Estimated fee:', feeEstimate.overall_fee);
```

#### Implementation of

`ContractInterface.estimate`

***

### populate()

> **populate**(`method`, `args?`): [`Call`](../type-aliases/Call.md)

Defined in: node\_modules/starknet/dist/index.d.ts:5559

Populate transaction data for a contract method call

#### Parameters

##### method

`string`

Name of the contract method

##### args?

`RawArgs`

Method arguments as array or calldata

#### Returns

[`Call`](../type-aliases/Call.md)

Invocation object for batching or inspection

#### Example

```typescript
const invocation = contract.populate('transfer', [recipient, amount]);
// Use in account.execute([invocation1, invocation2, ...])
```

#### Implementation of

`ContractInterface.populate`

***

### parseEvents()

> **parseEvents**(`receipt`): `ParsedEvents`

Defined in: node\_modules/starknet/dist/index.d.ts:5560

Parse events from a transaction receipt using the contract's ABI

#### Parameters

##### receipt

[`TxReceipt`](../type-aliases/TxReceipt.md)

Transaction receipt from waitForTransaction

#### Returns

`ParsedEvents`

Array of parsed events with decoded data

#### Example

```typescript
const receipt = await provider.waitForTransaction(txHash);
const events = contract.parseEvents(receipt);
events.forEach(event => {
  console.log('Event:', event.name, event.data);
});
```

#### Implementation of

`ContractInterface.parseEvents`

***

### isCairo1()

> **isCairo1**(): `boolean`

Defined in: node\_modules/starknet/dist/index.d.ts:5561

Check if the contract is implemented in Cairo 1

#### Returns

`boolean`

True if the contract uses Cairo 1, false for Cairo 0 (legacy)

#### Example

```typescript
if (contract.isCairo1()) {
  console.log('Using Cairo 1 features');
}
```

#### Implementation of

`ContractInterface.isCairo1`

***

### getVersion()

> **getVersion**(): `Promise`\<`ContractVersion`\>

Defined in: node\_modules/starknet/dist/index.d.ts:5562

Get the Cairo and compiler version of the contract

#### Returns

`Promise`\<`ContractVersion`\>

Object containing cairo version and compiler version

#### Example

```typescript
const version = await contract.getVersion();
console.log(`Cairo ${version.cairo}, Compiler ${version.compiler}`);
```

#### Implementation of

`ContractInterface.getVersion`

***

### typedv2()

> **typedv2**\<`TAbi`\>(`tAbi`): `TypedContractV2`\<`TAbi`\>

Defined in: node\_modules/starknet/dist/index.d.ts:5563

Create a typed contract instance with full TypeScript support

#### Type Parameters

##### TAbi

`TAbi` *extends* `Abi`

#### Parameters

##### tAbi

`TAbi`

The typed ABI interface for compile-time type checking

#### Returns

`TypedContractV2`\<`TAbi`\>

Typed contract instance with IntelliSense support

#### Example

```typescript
const typedContract = contract.typedv2(erc20Abi);
// Now typedContract.transfer() has full type safety
```

#### Implementation of

`ContractInterface.typedv2`

***

### factory()

> `static` **factory**(`params`, `details?`): `Promise`\<`Contract`\>

Defined in: node\_modules/starknet/dist/index.d.ts:5622

Factory method to declare and/or deploy a contract creating a new Contract instance

It handles the entire lifecycle: compiles constructor calldata, optionally declares the contract class,
deploys an instance, and returns a ready-to-use Contract object.

When classHash is provided, it will only deploy the contract without declaring.
When contract is provided without classHash, it will declare and deploy.

#### Parameters

##### params

`FactoryParams`

Factory parameters containing Contract Class details and deployment options

##### details?

`UniversalDetails`

#### Returns

`Promise`\<`Contract`\>

Promise that resolves to a deployed Contract instance with address and transaction hash

#### Throws

Error if deployment fails or contract_address is not returned

#### Example

```typescript
// Declare and deploy an ERC20 contract
const contract = await Contract.factory({
  contract: erc20CompiledContract,
  account: myAccount,
  casm: erc20Casm,
  constructorCalldata: {
    name: 'MyToken',
    symbol: 'MTK',
    decimals: 18,
    initial_supply: { low: 1000000, high: 0 },
    recipient: myAccount.address
  }
});

// Deploy-only mode with existing classHash (ABI will be fetched from network)
const contract2 = await Contract.factory({
  classHash: '0x1234...',
  account: myAccount,
  constructorCalldata: {
    name: 'AnotherToken',
    symbol: 'ATK',
    decimals: 18,
    initial_supply: { low: 2000000, high: 0 },
    recipient: myAccount.address
  }
});

// Deploy-only mode with provided ABI (faster, no network call)
const contract3 = await Contract.factory({
  classHash: '0x1234...',
  abi: erc20Abi,
  account: myAccount,
  constructorCalldata: {
    name: 'ThirdToken',
    symbol: 'TTK',
    decimals: 18,
    initial_supply: { low: 3000000, high: 0 },
    recipient: myAccount.address
  }
});

console.log('Contract deployed at:', contract.address);
```\
