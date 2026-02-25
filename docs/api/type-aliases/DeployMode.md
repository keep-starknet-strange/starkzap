[**x**](../README.md)

---

[x](../globals.md) / DeployMode

# Type Alias: DeployMode

> **DeployMode** = `"never"` \| `"if_needed"` \| `"always"`

Defined in: [src/types/wallet.ts:111](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/wallet.ts#L111)

When to deploy the account contract.

- `"never"`: Don't deploy, fail if not deployed
- `"if_needed"`: Deploy only if not already deployed
- `"always"`: Always attempt deployment
