[**starkzap**](../README.md)

***

[starkzap](../globals.md) / ExplorerConfig

# Interface: ExplorerConfig

Defined in: [src/types/config.ts:122](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/config.ts#L122)

Configuration for building explorer URLs.

## Example

```ts
// Use a known provider
{ provider: "voyager" }

// Use a custom explorer
{ baseUrl: "https://my-explorer.com" }
```

## Properties

### provider?

> `optional` **provider**: [`ExplorerProvider`](../type-aliases/ExplorerProvider.md)

Defined in: [src/types/config.ts:124](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/config.ts#L124)

Use a known explorer provider

***

### baseUrl?

> `optional` **baseUrl**: `string`

Defined in: [src/types/config.ts:126](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/config.ts#L126)

Or provide a custom base URL (takes precedence over provider)
