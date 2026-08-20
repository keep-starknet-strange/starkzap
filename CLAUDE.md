# CLAUDE.md

<identity>
Starkzap is a TypeScript SDK for Starknet wallet onboarding, ERC20 transfers, staking, and batched transactions.
The main output is a typed ESM library built from `src/` and exported via `src/index.ts`.
</identity>

<environment>
- Operate from repository root in a terminal-based agent harness.
- Prefer `rtk <command>` when `rtk` is installed; otherwise run the underlying command directly.
- Package manager: `npm` (`package-lock.json` is canonical).
- Network access is needed for RPC-backed integration tests and preset-generation scripts.
</environment>

<stack>
| Area | Tooling | Notes |
| --- | --- | --- |
| Language | TypeScript (strict) | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` enabled |
| Runtime | Node.js ESM | `"type": "module"` |
| Blockchain SDK | `starknet` | Core RPC/account/tx interactions |
| Optional wallet integration | `@cartridge/controller` | Optional peer dependency |
| Build | `tsc` + `tsc-alias` | Outputs to `dist/` |
| Lint/Format | ESLint 9 + Prettier 3 | TS lint rules + prettier compatibility config |
| Tests | Vitest (unit + integration projects) | Integration uses `starknet-devnet` |
| Docs | Separate repo | Prose docs live in [`starknet-io/starknet-docs`](https://github.com/starknet-io/starknet-docs) under `build/starkzap/` — not in this repo. There is no generated API reference; JSDoc in `src/` is the only reference material here |
</stack>

<structure>
| Path | Purpose |
| --- | --- |
| `src/sdk.ts` | Main SDK orchestration (`StarkZap`) |
| `src/wallet/` | Wallet implementations and shared wallet behavior |
| `src/tx/` | Transaction wrapper and fluent builder |
| `src/erc20/` | ERC20 helpers + token preset registry |
| `src/staking/` | Staking module + validator preset registry |
| `src/types/` | Shared domain types and config contracts |
| `src/network/` | Network presets and chain metadata |
| `scripts/` | Preset generation + the declaration-leak check |
| `tests/` | Unit tests + `tests/integration/` devnet-backed tests |
| `examples/` | Web/mobile/server usage samples |
| `packages/native/` | `starkzap-native` — React Native wrapper, mirrors core's entry points |
</structure>

<critical_paths>
- `src/sdk.ts`, `src/wallet/*`, `src/tx/*` for API behavior changes
- `src/index.ts` for public exports
- `src/types/*` for cross-module contracts
- `tests/**/*.test.ts` for behavior validation
</critical_paths>

<conventions>
<do>
- Use `@/` path alias for internal imports.
- Keep public API changes intentional and export them via `src/index.ts`.
- Preserve strict typing; prefer explicit domain types (`Address`, `Amount`, `ChainId`) over primitives.
- Add or update colocated tests when behavior changes.
- Regenerate generated presets with scripts instead of manual edits.
</do>
<dont>
- Do not bypass URL validation helpers for RPC/explorer endpoints.
- Do not introduce CommonJS patterns.
- Do not hand-edit auto-generated preset or docs artifacts.
- Do not silently change network defaults or chain IDs.
</dont>
</conventions>

<commands>
| Task | Command | Notes |
| --- | --- | --- |
| Install deps | `npm install` | Root install |
| Build | `npm run build` | `tsc` + alias rewrite |
| Typecheck | `npm run typecheck` | No emit |
| Lint | `npm run lint` | ESLint |
| Lint autofix | `npm run fix` | ESLint `--fix` |
| Format | `npm run prettier` | Writes files |
| Format check | `npm run prettier:check` | CI-style formatting check |
| Unit tests | `npm test` | Vitest `unit` project |
| Integration tests | `npm run test:integration` | Starts devnet via Vitest global setup |
| Full test matrix | `npm run test:all` | Unit + integration |
| Coverage | `npm run test:coverage` | Unit coverage thresholds enabled |
| Declaration leak check | `npm run check:declarations` | Packs the build and typechecks it as a consumer with no optional peers. Needs `npm run build` first |
| Generate token presets | `npm run generate:tokens` / `npm run generate:tokens:sepolia` | Writes `src/erc20/token/presets*.ts` |
| Generate validator presets | `npm run generate:validators` / `npm run generate:validators:sepolia` | Requires `VOYAGER_API_KEY` |
</commands>

<workflows>
<workflow name="feature-or-refactor-in-src">
1. Identify affected module(s) under `src/` and corresponding tests under `tests/`.
2. Implement minimal, typed changes that preserve existing API semantics unless change is explicit.
3. Update `src/index.ts` only when introducing/removing public exports.
4. Update or add tests in matching domain test files.
5. Run only the smallest relevant command set (targeted test project first, full matrix only when requested).
</workflow>

<workflow name="regenerate-token-or-validator-presets">
1. Do not edit preset files directly.
2. Run the relevant generation script from `scripts/`.
3. For validator generation, ensure `VOYAGER_API_KEY` is set.
4. Review generated diffs for obvious schema/source regressions before merging.
</workflow>

<workflow name="update-docs">
Prose docs are **not in this repo**. They live in
[`starknet-io/starknet-docs`](https://github.com/starknet-io/starknet-docs) under
`build/starkzap/`, wherever the developer has that repo checked out — ask rather
than guess the path, and check `git status` there first, since it often carries
unrelated work in progress.

1. If the change is about behaviour or API, change the public API and its JSDoc here
   first. JSDoc is the source of truth for behaviour; the docs site restates it for
   humans. Prose-only work in the docs repo — wording, examples, structure, typos —
   needs no change here.
2. In the docs checkout, update the affected pages under `build/starkzap/`. Grep for
   every symbol whose name, entry point, or signature changed — a page can be wrong
   without mentioning the symbol you changed, e.g. an import that still names the
   root entry after a symbol moved to a subpath.
3. Verify rather than eyeball: for every entry point in `package.json`'s `exports`,
   extract its declared exports from the emitted `.d.ts`, then check each
   `import { … } from "starkzap…"` in the pages against the right one. Runtime
   `Object.keys()` misses type-only exports, so read the declarations.
4. Leave the docs repo uncommitted for review unless asked otherwise; it is a
   separate repo with its own review process.
</workflow>
</workflows>

<boundaries>
<gated_operations>
- Dependency changes in `package.json` or `package-lock.json` require human approval.
- Committing or pushing in the separate docs repo requires human approval — it is not this project.
- Any command that publishes/releases artifacts requires human approval.
- Changing generated presets requires running generator scripts (not manual edits).
- Running integration tests against forked RPC (`FORK_NETWORK`) requires explicit intent.
</gated_operations>

<forbidden>
DO NOT modify manually:
- `.env*` files or credential material
- `src/erc20/token/presets.ts`
- `src/erc20/token/presets.sepolia.ts`
- `src/staking/validator/presets.ts`
- `src/staking/validator/presets.sepolia.ts`
</forbidden>
</boundaries>

<troubleshooting>
| Symptom | Likely Cause | Action |
| --- | --- | --- |
| `RPC chain mismatch` from `StarkZap` | `rpcUrl` chain differs from configured `chainId`/network | Align `SDKConfig` values |
| Integration tests stall/fail at setup | `starknet-devnet` startup issue or busy local port | Re-run integration tests, check local port/process conflicts |
| Validator generation fails immediately | Missing `VOYAGER_API_KEY` | Export key and rerun generator |
| Cartridge connect errors in tests/CLI | Cartridge flow requires browser context/popups | Use non-Cartridge path for non-web tests |
| Empty/invalid token metadata warnings | Non-standard ERC20 metadata on target contract | Verify token address and RPC endpoint |
</troubleshooting>

<skills>
- `skills/integration-testing.md`
- `skills/presets-regeneration.md`
- `skills/starknet-upgrade.md`
</skills>
