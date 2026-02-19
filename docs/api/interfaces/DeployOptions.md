[**starkzap**](../README.md)

***

[starkzap](../globals.md) / DeployOptions

# Interface: DeployOptions

Defined in: [src/types/wallet.ts:150](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/wallet.ts#L150)

Options for `wallet.deploy()`

## Properties

### feeMode?

> `optional` **feeMode**: [`FeeMode`](../type-aliases/FeeMode.md)

Defined in: [src/types/wallet.ts:152](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/wallet.ts#L152)

How fees are paid (default: "user_pays")

***

### timeBounds?

> `optional` **timeBounds**: [`PaymasterTimeBounds`](PaymasterTimeBounds.md)

Defined in: [src/types/wallet.ts:154](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/wallet.ts#L154)

Optional time bounds for paymaster-sponsored deployment
