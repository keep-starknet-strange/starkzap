[**x**](../README.md)

---

[x](../globals.md) / ExplorerConfig

# Interface: ExplorerConfig

Defined in: [src/types/config.ts:122](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/config.ts#L122)

Configuration for building explorer URLs.

## Example

```ts
// Use a known provider
{
  provider: "voyager";
}

// Use a custom explorer
{
  baseUrl: "https://my-explorer.com";
}
```

## Properties

### provider?

> `optional` **provider**: [`ExplorerProvider`](../type-aliases/ExplorerProvider.md)

Defined in: [src/types/config.ts:124](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/config.ts#L124)

Use a known explorer provider

---

### baseUrl?

> `optional` **baseUrl**: `string`

Defined in: [src/types/config.ts:126](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/config.ts#L126)

Or provide a custom base URL (takes precedence over provider)
