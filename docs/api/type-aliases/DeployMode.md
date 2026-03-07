[**starkzap**](../README.md)

***

[starkzap](../globals.md) / DeployMode

# Type Alias: DeployMode

> **DeployMode** = `"never"` \| `"if_needed"` \| `"always"`

Defined in: [src/types/wallet.ts:116](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/wallet.ts#L116)

When to deploy the account contract.
- `"never"`: Don't deploy, fail if not deployed
- `"if_needed"`: Deploy only if not already deployed
- `"always"`: Always attempt deployment
