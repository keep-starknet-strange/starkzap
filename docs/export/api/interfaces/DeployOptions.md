[**x**](../README.md)

---

[x](../globals.md) / DeployOptions

# Interface: DeployOptions

Defined in: [src/types/wallet.ts:149](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/wallet.ts#L149)

Options for `wallet.deploy()`

## Properties

### feeMode?

> `optional` **feeMode**: [`FeeMode`](../type-aliases/FeeMode.md)

Defined in: [src/types/wallet.ts:151](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/wallet.ts#L151)

How fees are paid (default: "user_pays")

---

### timeBounds?

> `optional` **timeBounds**: [`PaymasterTimeBounds`](PaymasterTimeBounds.md)

Defined in: [src/types/wallet.ts:153](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/wallet.ts#L153)

Optional time bounds for paymaster-sponsored deployment
