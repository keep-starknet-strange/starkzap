---
name: Starknet Upgrade
triggers:
  - upgrade starknet
  - bump starknet
  - starknet-types
  - starknet-io
  - PAYMASTER_API
  - L1Message
  - phantom dependency
---

# Starknet Upgrade

<purpose>
Keep the `@starknet-io/starknet-types-*` spec package in sync when bumping `starknet`.
The SDK imports RPC spec types directly from that package, so a starknet bump that
changes its aliased spec version silently strands our pin and duplicates the types.
</purpose>

<context>
`starknet` re-exports spec types only as value bindings:

```ts
declare const index$4_PAYMASTER_API: typeof PAYMASTER_API;
declare const index$4_RPCSPEC0103: typeof RPCSPEC0103;
```

`typeof` consts are unusable in type position, so `RPC.PAYMASTER_API.X` and
`RPC.RPCSPEC0103.X` do not compile. The only reachable namespace is `RPC.RPCSPEC09`,
which aliases `types-js@~0.9.2` — do not reach for it to dodge the dependency; it
pins spec-0.9 types into a v10 SDK. Import from the aliased spec package instead.

Current importers:

| File | Type |
| --- | --- |
| `src/wallet/utils.ts` | `PAYMASTER_API` |
| `src/wallet/accounts/provider.ts` | `PAYMASTER_API` |
| `src/bridge/ethereum/canonical/CanonicalEthereumBridge.ts` | `L1Message` |
| `src/bridge/ethereum/lords/LordsBridge.ts` | `L1Message` |

History: starknet v9 resolved these via `-010`; v10.5 uses `-0103`. The alias name
tracks the RPC spec version, so it changes on spec bumps, not on every release.
</context>

<procedure>
1. Bump `starknet` in `package.json`.
2. Read the alias starknet now uses for its spec types:
   `node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync("node_modules/starknet/package.json","utf8"));console.log(p.dependencies)' | grep starknet-types`
3. If the alias name changed (e.g. `-0103` → `-0104`):
   - Update our `dependencies` entry in `package.json` to the same alias and the
     same exact version starknet pins.
   - Update the import specifier in every importer listed above.
4. `npm install` and confirm a single resolved copy (see `<verification>`).
5. Run `npm run typecheck && npm run build && npm test`.
</procedure>

<patterns>
<do>
- Declare it in `dependencies`. The import survives into `dist/**/*.d.ts` and
  `files: ["dist"]` publishes those, so consumers need it installed to typecheck.
- Pin the exact version starknet pins, no caret. Same alias name + same exact
  version is what collapses ours and starknet's into one `node_modules` entry.
- Re-check the alias on every starknet bump, even a patch.
</do>
<dont>
- Do not use `devDependencies` — consumers would hit the phantom-dependency
  typecheck break that this declaration exists to fix.
- Do not use `peerDependencies` — wrong ergonomics for a types-only artifact.
- Do not use a caret range. `^0.10.3` lets a consumer resolve 0.10.4 while
  starknet stays on 0.10.3, yielding two copies of the declarations and confusing
  cross-package assignability errors.
- Do not substitute `RPC.RPCSPEC09.*` to avoid the dependency (see `<context>`).
</dont>
</patterns>

<verification>
```bash
# exactly one resolved copy, and both declarers agree
node -e 'const l=require("./package-lock.json");Object.entries(l.packages).forEach(([k,v])=>{const d=v.dependencies&&v.dependencies["@starknet-io/starknet-types-0103"];if(d)console.log((k||"<root>"),"=>",d)})'
```

Expected: `<root>` and `node_modules/starknet` print the same `npm:` specifier.
Divergence means a duplicate copy is about to appear.
</verification>

<troubleshooting>
- `has no exported member 'PAYMASTER_API'` on `RPC`: expected — import from the
  aliased spec package, not from `starknet`.
- Consumer typecheck fails on a missing `@starknet-io/*` module: the package
  slipped out of `dependencies`, or the alias name drifted from the import specifier.
- Two `types-js` versions under `@starknet-io/`: our pin no longer matches
  starknet's. Realign to starknet's exact version.
</troubleshooting>
