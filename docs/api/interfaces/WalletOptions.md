[**x**](../README.md)

---

[x](../globals.md) / WalletOptions

# Interface: WalletOptions

Defined in: [src/wallet/index.ts:53](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/index.ts#L53)

Options for creating a Wallet.

## Properties

### account

> **account**: [`AccountProvider`](../classes/AccountProvider.md) \| \{ `signer`: [`SignerInterface`](SignerInterface.md); `accountClass?`: [`AccountClassConfig`](AccountClassConfig.md); \}

Defined in: [src/wallet/index.ts:55](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/index.ts#L55)

Account: either AccountProvider or { signer, accountClass? }

---

### provider

> **provider**: `RpcProvider`

Defined in: [src/wallet/index.ts:59](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/index.ts#L59)

RPC provider

---

### config

> **config**: [`SDKConfig`](SDKConfig.md)

Defined in: [src/wallet/index.ts:61](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/index.ts#L61)

SDK configuration

---

### accountAddress?

> `optional` **accountAddress**: [`Address`](../type-aliases/Address.md)

Defined in: [src/wallet/index.ts:63](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/index.ts#L63)

Known address (skips address computation if provided)

---

### feeMode?

> `optional` **feeMode**: [`FeeMode`](../type-aliases/FeeMode.md)

Defined in: [src/wallet/index.ts:65](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/index.ts#L65)

Default fee mode (default: "user_pays")

---

### timeBounds?

> `optional` **timeBounds**: [`PaymasterTimeBounds`](PaymasterTimeBounds.md)

Defined in: [src/wallet/index.ts:67](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/wallet/index.ts#L67)

Default time bounds for paymaster transactions
