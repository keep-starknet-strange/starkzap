[**starkzap**](../README.md)

***

[starkzap](../globals.md) / EkuboSwapProviderOptions

# Interface: EkuboSwapProviderOptions

Defined in: [src/swap/ekubo.ts:58](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/swap/ekubo.ts#L58)

## Properties

### apiBase?

> `optional` **apiBase**: `string`

Defined in: [src/swap/ekubo.ts:60](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/swap/ekubo.ts#L60)

Optional Ekubo quoter base URL override.

***

### fetcher()?

> `optional` **fetcher**: \{(`input`, `init?`): `Promise`\<`Response`\>; (`input`, `init?`): `Promise`\<`Response`\>; \}

Defined in: [src/swap/ekubo.ts:62](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/swap/ekubo.ts#L62)

Optional fetch implementation override for custom runtimes/tests.

#### Call Signature

> (`input`, `init?`): `Promise`\<`Response`\>

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Window/fetch)

##### Parameters

###### input

`URL` | `RequestInfo`

###### init?

`RequestInit`

##### Returns

`Promise`\<`Response`\>

#### Call Signature

> (`input`, `init?`): `Promise`\<`Response`\>

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Window/fetch)

##### Parameters

###### input

`string` | `URL` | `Request`

###### init?

`RequestInit`

##### Returns

`Promise`\<`Response`\>
