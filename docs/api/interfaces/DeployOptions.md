[**starkzap**](../README.md)

***

[starkzap](../globals.md) / DeployOptions

# Interface: DeployOptions

Defined in: [src/types/wallet.ts:155](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/wallet.ts#L155)

Options for `wallet.deploy()`

## Properties

### feeMode?

> `optional` **feeMode**: [`FeeMode`](../type-aliases/FeeMode.md)

Defined in: [src/types/wallet.ts:157](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/wallet.ts#L157)

How fees are paid (default: "user_pays")

***

### timeBounds?

> `optional` **timeBounds**: [`PaymasterTimeBounds`](PaymasterTimeBounds.md)

Defined in: [src/types/wallet.ts:159](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/wallet.ts#L159)

Optional time bounds for paymaster-sponsored deployment
