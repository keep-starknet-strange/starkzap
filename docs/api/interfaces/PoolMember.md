[**x**](../README.md)

---

[x](../globals.md) / PoolMember

# Interface: PoolMember

Defined in: [src/types/pool.ts:22](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/pool.ts#L22)

Pool member position information

## Properties

### staked

> **staked**: [`Amount`](../classes/Amount.md)

Defined in: [src/types/pool.ts:24](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/pool.ts#L24)

Staked amount (active in pool)

---

### rewards

> **rewards**: [`Amount`](../classes/Amount.md)

Defined in: [src/types/pool.ts:26](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/pool.ts#L26)

Unclaimed rewards available to claim

---

### total

> **total**: [`Amount`](../classes/Amount.md)

Defined in: [src/types/pool.ts:28](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/pool.ts#L28)

Total position value (staked + rewards)

---

### unpooling

> **unpooling**: [`Amount`](../classes/Amount.md)

Defined in: [src/types/pool.ts:30](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/pool.ts#L30)

Amount currently in exit process

---

### unpoolTime

> **unpoolTime**: `Date` \| `null`

Defined in: [src/types/pool.ts:32](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/pool.ts#L32)

Timestamp when exit can be completed (if unpooling)

---

### commissionPercent

> **commissionPercent**: `number`

Defined in: [src/types/pool.ts:34](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/pool.ts#L34)

Commission rate as percentage (e.g., 10 = 10%)

---

### rewardAddress

> **rewardAddress**: [`Address`](../type-aliases/Address.md)

Defined in: [src/types/pool.ts:36](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/pool.ts#L36)

The reward address for this pool member
