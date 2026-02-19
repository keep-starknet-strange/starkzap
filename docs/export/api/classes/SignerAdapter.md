[**starkzap**](../README.md)

***

[starkzap](../globals.md) / SignerAdapter

# Class: SignerAdapter

Defined in: [src/signer/adapter.ts:67](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/signer/adapter.ts#L67)

Adapter that bridges the SDK's minimal [SignerInterface](../interfaces/SignerInterface.md) to the
full `starknet.js` `SignerInterface`.

Custom signers only need to implement two methods (`getPubKey` + `signRaw`).
This adapter handles the complex transaction hash computations required by
`starknet.js` Account for invoke, deploy-account, and declare transactions.

## Remarks

You don't normally create this directly — the SDK creates it internally
when you call `sdk.connectWallet()`.

## Example

```ts
import { SignerAdapter, StarkSigner } from "starkzap";
import { Account, RpcProvider } from "starknet";

const adapter = new SignerAdapter(new StarkSigner(privateKey));
const account = new Account({ provider, address, signer: adapter });
```

## Implements

- `SignerInterface`

## Constructors

### Constructor

> **new SignerAdapter**(`signer`): `SignerAdapter`

Defined in: [src/signer/adapter.ts:68](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/signer/adapter.ts#L68)

#### Parameters

##### signer

[`SignerInterface`](../interfaces/SignerInterface.md)

#### Returns

`SignerAdapter`

## Methods

### getPubKey()

> **getPubKey**(): `Promise`\<`string`\>

Defined in: [src/signer/adapter.ts:70](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/signer/adapter.ts#L70)

Method to get the public key of the signer

#### Returns

`Promise`\<`string`\>

hex-string public key

#### Example

```typescript
const mySigner = new Signer("0x123");
const result = await mySigner.getPubKey();
// result = "0x566d69d8c99f62bc71118399bab25c1f03719463eab8d6a444cd11ece131616"
```

#### Implementation of

`StarknetSignerInterface.getPubKey`

***

### signMessage()

> **signMessage**(`typedData`, `accountAddress`): `Promise`\<`Signature`\>

Defined in: [src/signer/adapter.ts:74](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/signer/adapter.ts#L74)

Signs a JSON object for off-chain usage with the private key and returns the signature.
This adds a message prefix so it can't be interchanged with transactions

#### Parameters

##### typedData

`TypedData`

JSON object to be signed

##### accountAddress

`string`

Hex string of the account's address

#### Returns

`Promise`\<`Signature`\>

the signature of the message

#### Example

```typescript
const mySigner = new Signer("0x123");
const myTypedData: TypedData = {
  domain: {
    name: "Example DApp",
    chainId: constants.StarknetChainId.SN_SEPOLIA,
    version: "0.0.3"
  },
  types: {
    StarkNetDomain: [
      { name: "name", type: "string" },
      { name: "chainId", type: "felt" },
      { name: "version", type: "string" }
    ],
    Message: [{ name: "message", type: "felt" }]
  },
  primaryType: "Message",
  message: { message: "1234" }
};
const result = await mySigner.signMessage(myTypedData, "0x5d08a4e9188429da4e993c9bf25aafe5cd491ee2b501505d4d059f0c938f82d");
// result = Signature {r: 684915484701699003335398790608214855489903651271362390249153620883122231253n,
// s: 1399150959912500412309102776989465580949387575375484933432871778355496929189n, recovery: 1}
```

#### Implementation of

`StarknetSignerInterface.signMessage`

***

### signTransaction()

> **signTransaction**(`transactions`, `details`): `Promise`\<`Signature`\>

Defined in: [src/signer/adapter.ts:82](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/signer/adapter.ts#L82)

Signs INVOKE transactions with the private key and returns the signature

#### Parameters

##### transactions

[`Call`](../type-aliases/Call.md)[]

Array of Call objects representing the transactions

##### details

`InvocationsSignerDetails`

#### Returns

`Promise`\<`Signature`\>

the signature of the transaction

#### Remarks

Only supports V3 transactions. V0, V1, and V2 transactions will throw an error.

#### Example

```typescript
const mySigner = new Signer("0x123");
const calls: Call[] = [{
  contractAddress: "0x1234567890123456789012345678901234567890",
  entrypoint: "transfer",
  calldata: ["0xRecipient", "1000", "0"]
}];
const transactionsDetail: InvocationsSignerDetails = {
  walletAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
  chainId: constants.StarknetChainId.SN_MAIN,
  cairoVersion: "1",
  version: "0x3",
  nonce: 1,
  resourceBounds: {
    l1_gas: { amount: "0x1000", price: "0x20" },
    l2_gas: { amount: "0x200", price: "0x5" },
    l1_data_gas: { amount: "0x500", price: "0x10" }
  },
  tip: 0,
  paymasterData: [],
  accountDeploymentData: [],
  nonceDataAvailabilityMode: RPC.EDataAvailabilityMode.L1,
  feeDataAvailabilityMode: RPC.EDataAvailabilityMode.L1
};
const result = await mySigner.signTransaction(calls, transactionsDetail);
// result = Signature {r: 304910226421970384958146916800275294114105560641204815169249090836676768876n,
//   s: 1072798866000813654190523783606274062837012608648308896325315895472901074693n, recovery: 0}
```

#### Implementation of

`StarknetSignerInterface.signTransaction`

***

### signDeployAccountTransaction()

> **signDeployAccountTransaction**(`details`): `Promise`\<`Signature`\>

Defined in: [src/signer/adapter.ts:111](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/signer/adapter.ts#L111)

Signs a DEPLOY_ACCOUNT transaction with the private key and returns the signature

#### Parameters

##### details

`V3DeployAccountSignerDetails`

#### Returns

`Promise`\<`Signature`\>

the signature of the transaction to deploy an account

#### Remarks

Only supports V3 transactions. V0, V1, and V2 transactions will throw an error.

#### Example

```typescript
const mySigner = new Signer("0x123");
const myDeployAcc: DeployAccountSignerDetails = {
  contractAddress: "0x65a822fbee1ae79e898688b5a4282dc79e0042cbed12f6169937fddb4c26641",
  version: "0x3",
  chainId: constants.StarknetChainId.SN_SEPOLIA,
  classHash: "0x5f3614e8671257aff9ac38e929c74d65b02d460ae966cd826c9f04a7fa8e0d4",
  constructorCalldata: ["0x123", "0x456"],
  addressSalt: "0x789",
  nonce: 0,
  resourceBounds: {
    l1_gas: { amount: "0x1000", price: "0x20" },
    l2_gas: { amount: "0x200", price: "0x5" },
    l1_data_gas: { amount: "0x500", price: "0x10" }
  },
  tip: 0,
  paymasterData: [],
  accountDeploymentData: [],
  nonceDataAvailabilityMode: RPC.EDataAvailabilityMode.L1,
  feeDataAvailabilityMode: RPC.EDataAvailabilityMode.L1
};
const result = await mySigner.signDeployAccountTransaction(myDeployAcc);
// result = Signature {r: 2871311234341436528393212130310036951068553852419934781736214693308640202748n,
//  s: 1746271646048888422437132495446973163454853863041370993384284773665861377605n, recovery: 1}
```

#### Implementation of

`StarknetSignerInterface.signDeployAccountTransaction`

***

### signDeclareTransaction()

> **signDeclareTransaction**(`details`): `Promise`\<`Signature`\>

Defined in: [src/signer/adapter.ts:138](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/signer/adapter.ts#L138)

Signs a DECLARE transaction with the private key and returns the signature

#### Parameters

##### details

`DeclareSignerDetails`

#### Returns

`Promise`\<`Signature`\>

the signature of the transaction to declare a class

#### Remarks

Only supports V3 transactions. V0, V1, and V2 transactions will throw an error.

#### Example

```typescript
const mySigner = new Signer("0x123");
const myDeclare: DeclareSignerDetails = {
  version: "0x3",
  chainId: constants.StarknetChainId.SN_SEPOLIA,
  senderAddress: "0x65a822fbee1ae79e898688b5a4282dc79e0042cbed12f6169937fddb4c26641",
  classHash: "0x5f3614e8671257aff9ac38e929c74d65b02d460ae966cd826c9f04a7fa8e0d4",
  compiledClassHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  nonce: 45,
  resourceBounds: {
    l1_gas: { amount: "0x1000", price: "0x20" },
    l2_gas: { amount: "0x200", price: "0x5" },
    l1_data_gas: { amount: "0x500", price: "0x10" }
  },
  tip: 0,
  paymasterData: [],
  accountDeploymentData: [],
  nonceDataAvailabilityMode: RPC.EDataAvailabilityMode.L1,
  feeDataAvailabilityMode: RPC.EDataAvailabilityMode.L1
};
const result = await mySigner.signDeclareTransaction(myDeclare);
// result = Signature {r: 2432056944313955951711774394836075930010416436707488863728289188289211995670n,
//  s: 3407649393310177489888603098175002856596469926897298636282244411990343146307n, recovery: 1}
```

#### Implementation of

`StarknetSignerInterface.signDeclareTransaction`
