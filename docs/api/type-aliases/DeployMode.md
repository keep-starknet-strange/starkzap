[**starkzap**](../README.md)

***

[starkzap](../globals.md) / DeployMode

# Type Alias: DeployMode

> **DeployMode** = `"never"` \| `"if_needed"` \| `"always"`

Defined in: [src/types/wallet.ts:111](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/wallet.ts#L111)

When to deploy the account contract.
- `"never"`: Don't deploy, fail if not deployed
- `"if_needed"`: Deploy only if not already deployed
- `"always"`: Always attempt deployment
