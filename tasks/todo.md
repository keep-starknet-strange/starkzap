# Task: DCA Module Using AVNU and EKUBO (2026-03-11)

## Plan
- [x] Define a DCA client/provider API that matches existing wallet, swap, and lending patterns.
- [x] Implement an AVNU-backed DCA provider for list/create/cancel flows and keep EKUBO support explicit to the parts of the flow the repo can actually control.
- [x] Integrate DCA helpers into wallet and transaction builder surfaces without expanding unrelated config scope.
- [x] Add targeted unit tests for provider behavior, wallet DCA flows, and transaction builder batching/error paths.
- [x] Run targeted validation (`vitest`, `typecheck`, `build`) and record the review summary.

## Review
- Added a new `src/dca/` module with:
  - `DcaClient` for wallet-scoped DCA operations
  - `AvnuDcaProvider` for AVNU-backed order listing, creation, and cancellation
  - typed request/result interfaces and address hydration utilities
- Integrated DCA into the existing wallet/builder architecture:
  - `wallet.dca()` now exposes the DCA client
  - `TxBuilder` now supports `.dcaCreate(...)` and `.dcaCancel(...)`
  - root exports now include `@/dca`
- Kept EKUBO support explicit where the codebase can actually control it:
  - `DcaClient.previewCycle()` reuses the wallet’s registered swap providers, so recurring-leg previews can be quoted through EKUBO or AVNU
  - actual recurring order lifecycle remains AVNU-backed because the bundled AVNU DCA API does not expose per-order source selection
- Added focused coverage:
  - `tests/dca-avnu-provider.test.ts`
  - `tests/dca-wallet.test.ts`
  - updated `tests/tx-builder.test.ts`
- Verification:
  - `rtk proxy npm run -s typecheck`
  - `rtk vitest run tests/dca-avnu-provider.test.ts tests/dca-wallet.test.ts tests/tx-builder.test.ts tests/swap-avnu.test.ts tests/lending-wallet.test.ts tests/swap-wallet.test.ts`
  - `rtk proxy npm run -s build`

# Task: Web Example DCA Integration (2026-03-11)

## Plan
- [x] Add a DCA section to the web example that matches the existing wallet/swap interaction model.
- [x] Keep the example honest about protocol boundaries: AVNU handles recurring order lifecycle, while AVNU/EKUBO are only used for per-cycle preview routing.
- [x] Update the web example README with DCA usage notes.
- [x] Run focused validation for the web example and record the review summary.

## Review
- Added a new DCA panel to the web example in:
  - `examples/web/index.html`
  - `examples/web/main.ts`
- The panel now supports:
  - per-cycle preview via AVNU or EKUBO using `wallet.dca().previewCycle(...)`
  - recurring order creation via `wallet.dca().create(...)`
  - inline order refresh and cancellation via `wallet.dca().getOrders(...)` / `cancel(...)`
- Kept protocol behavior explicit in the UI and docs:
  - AVNU backs recurring order lifecycle
  - EKUBO is only exposed as an optional cycle-preview source
- Updated docs in `examples/web/README.md` to describe the DCA flow and the AVNU/EKUBO boundary.
- Verification:
  - `rtk proxy npm run -s typecheck`
  - `rtk proxy npm run -s build` (from `examples/web`)
  - Note: Vite reported its usual large-chunk warning during the example build, but the build completed successfully.

# Task: Mobile Example DCA Integration (2026-03-11)

## Plan
- [x] Add a compact DCA flow to the existing mobile swap screen without expanding the app navigation.
- [x] Reuse the existing token picker/modal patterns and keep DCA token choices explicit and chain-specific.
- [x] Wire AVNU-backed create/list/cancel flows plus AVNU or EKUBO cycle preview into the mobile example.
- [x] Update the mobile example README to document the DCA flow and provider boundary.
- [x] Run focused validation and record the review summary.

## Review
- Added DCA support to the existing mobile swap tab in:
  - `examples/mobile/app/(tabs)/swap.tsx`
- Kept the UI surface compact:
  - added a `Swap / DCA` mode switch inside the existing tab instead of expanding app navigation
  - reused the existing token picker modal for both swap and DCA flows
  - limited DCA token selection to a curated, chain-specific list rather than the full swap token universe
- Wired the mobile example to the new SDK DCA surface:
  - `wallet.dca().previewCycle(...)` for one-cycle previews through AVNU or EKUBO
  - `wallet.dca().create(...)` for AVNU-backed recurring order creation
  - `wallet.dca().getOrders(...)` for recent-order refresh
  - `wallet.dca().cancel(...)` for inline active-order cancellation
- Updated `examples/mobile/README.md` to describe the DCA flow and the AVNU lifecycle vs preview-provider boundary.
- Verification:
  - `rtk proxy npm run -s typecheck`
  - `rtk proxy npm run -s lint` (from `examples/mobile`)
  - `rtk proxy npm exec tsc -- --noEmit` (from `examples/mobile`)
  - Note: `examples/mobile` lint still reports pre-existing warnings in `app/(tabs)/balances.tsx`, `app/(tabs)/staking.tsx`, and `app/index.tsx`; no new lint errors were introduced by the DCA change.

# Task: Mobile Example DCA Provider Wiring Fix (2026-03-11)

## Plan
- [x] Fix the mobile onboarding path so connected wallets register the same swap providers the screen exposes.
- [x] Make the mobile swap/DCA provider pickers read from the connected wallet provider registry instead of a disconnected static list.
- [x] Clarify docs around AVNU-native DCA vs provider-based cycle preview and rerun targeted validation.

## Review
- Root cause:
  - `examples/mobile/app/(tabs)/swap.tsx` exposed a local `[AVNU, EKUBO]` provider list for DCA preview.
  - `examples/mobile/stores/wallet.ts` onboarded wallets without passing `swapProviders`, so the connected wallet only had its built-in default swap provider (`avnu`) registered.
  - `wallet.dca().previewCycle({ swapProvider: "ekubo" })` then failed correctly with `Unknown swap provider "ekubo". Registered providers: avnu.`
- Fix:
  - `examples/mobile/stores/wallet.ts` now passes `swapProviders` and `defaultSwapProviderId` into both signer and Privy onboarding flows.
  - `examples/mobile/app/(tabs)/swap.tsx` now derives provider choices from the connected wallet registry via `wallet.listSwapProviders()` / `wallet.getSwapProvider(...)` instead of trusting a disconnected static list.
  - `examples/mobile/README.md` now explicitly states that AVNU handles the recurring order lifecycle and EKUBO is only used for one-cycle preview quotes.
- Verification:
  - `rtk proxy npm run -s typecheck`
  - `rtk proxy npm exec tsc -- --noEmit` (from `examples/mobile`)
  - `rtk proxy npm run -s lint` (from `examples/mobile`)
  - Note: lint still reports the same pre-existing warnings in `examples/mobile/app/(tabs)/balances.tsx`, `examples/mobile/app/(tabs)/staking.tsx`, and `examples/mobile/app/index.tsx`.

# Task: Native Ekubo DCA Support (2026-03-11)

## Plan
- [x] Extend the DCA API just enough to represent provider-native order identity and cancellation without breaking AVNU callers.
- [x] Add first-class DCA provider registration to wallet/connect/onboard flows so examples and apps can expose AVNU and EKUBO consistently.
- [x] Implement a native `EkuboDcaProvider` for create/list/cancel using Ekubo TWAMM contracts and official APIs.
- [x] Update the web and mobile examples to let users choose the recurring-order backend explicitly instead of implying preview support equals native DCA support.
- [x] Add focused tests for the new provider, wallet registration flow, and builder/backward-compat behavior, then rerun targeted validation.

## Review
- DCA surface changes:
  - added `EkuboDcaProvider` in `src/dca/ekubo.ts`
  - extended DCA provider context with RPC access so providers can enrich or cancel native orders using on-chain reads
  - added provider-aware cancellation (`orderId` for native backends, `orderAddress` retained for AVNU) while keeping AVNU create/list/cancel behavior intact
  - added `providerId` to returned `DcaOrder` values so example UIs can route refresh/cancel actions back to the correct backend
- Wallet/onboarding integration:
  - added `dcaProviders` and `defaultDcaProviderId` to wallet connect/onboard surfaces
  - `Wallet.create(...)` and `sdk.onboard(...)` now register DCA providers the same way they already register swap providers
- Native Ekubo behavior:
  - create: discovers a TWAMM-enabled pool via Ekubo’s official pair-pools API, transfers funds into `Positions`, mints/increases the order, then clears leftover dust
  - list: uses Ekubo’s TWAP orders API plus `Positions.get_orders_info` to enrich remaining sell amount and unwithdrawn proceeds
  - cancel: uses a provider-native encoded order id, withdraws any proceeds, then decreases the sale rate to close the order
- Example updates:
  - web example now has a dedicated recurring-backend selector (`AVNU` or `Ekubo`) plus a separate cycle-preview selector
  - mobile example now has the same backend split and refreshes/cancels orders against the selected backend
  - example docs now describe AVNU as discrete recurring orders and Ekubo as native continuous TWAMM orders
- Verification:
  - `rtk vitest run tests/dca-avnu-provider.test.ts tests/dca-ekubo-provider.test.ts tests/dca-wallet.test.ts tests/wallet.test.ts tests/tx-builder.test.ts`
  - `rtk proxy npm run -s typecheck`
  - `rtk proxy npm run -s build`
  - `rtk proxy npm run -s build --workspace @starkzap/native`
  - `rtk proxy npm run -s build` (from `examples/web`)
  - `rtk proxy npm exec tsc -- --noEmit` (from `examples/mobile`)
  - `rtk proxy npm run -s lint` (from `examples/mobile`)
  - Note: `examples/mobile` lint still reports the same pre-existing warnings in `app/(tabs)/balances.tsx`, `app/(tabs)/staking.tsx`, and `app/index.tsx`.

# Task: PR #55 Review Refresh (2026-03-10)

## Plan
- [x] Refresh `upstream/pr-55` to the latest remote head and confirm the reviewed commit.
- [x] Re-read the current `upstream/main...upstream/pr-55` diff and identify risky areas.
- [x] Inspect affected tests for coverage gaps and behavioral mismatches.
- [x] Run targeted validation for changed lending, wallet, and tx-builder paths.
- [x] Record final findings or explicitly state that none were confirmed.

## Review
- Latest reviewed head: `3f87c09` (`fix: guard lending quote targets and vesu writes`).
- Re-reviewed scope:
  - `src/lending/client.ts`
  - `src/lending/interface.ts`
  - `src/lending/utils.ts`
  - `src/lending/vesu/provider.ts`
  - `src/wallet/base.ts`
  - `src/wallet/interface.ts`
  - `src/tx/builder.ts`
  - `src/sdk.ts`
  - `tests/lending-wallet.test.ts`
  - `tests/lending-vesu-provider.test.ts`
  - `tests/tx-builder.test.ts`
- Validation in fresh detached worktree `/tmp/starkzap-pr55-review2`:
  - `./node_modules/.bin/vitest run --project unit tests/lending-vesu-provider.test.ts tests/lending-wallet.test.ts tests/tx-builder.test.ts`
  - `./node_modules/.bin/tsc -p tsconfig.json --noEmit`
  - `npm run -s build`
- Outcome:
  - No confirmed correctness or regression findings on the latest PR head.
  - Residual note only: `quoteHealth()` still treats provider compatibility by resolved provider instance identity rather than provider id equality, which is stricter than the public request surface but appears intentional to avoid mixing differently configured provider instances.

# Task: Issue #57 Local Code Review

## Plan
- [x] Inspect Cartridge import/load paths in source.
- [x] Verify package metadata for optional dependency behavior.
- [x] Check related tests for coverage around Cartridge integration.
- [x] Run targeted tests for affected modules.
- [x] Summarize repo-only findings.

## Review
- `src/wallet/cartridge.ts` loads `@cartridge/controller` via `await import(...)` inside `loadCartridgeControllerModule()`.
- `src/sdk.ts` loads the Cartridge wallet via `await import("./wallet/cartridge")` in `connectCartridge()`.
- `package.json` marks `@cartridge/controller` as optional in `peerDependenciesMeta`.
- `tests/cartridge.test.ts` and `tests/wallet.test.ts` pass locally.
- Remaining gap: there is no explicit regression test that simulates a consumer bundling without `@cartridge/controller` installed.

# Task: Issue #58 Read-Only Address Queries

## Plan
- [x] Create dedicated branch for the fix.
- [x] Add `Address` overload support to `Erc20.balanceOf`.
- [x] Add `Address` overload support to `Staking.getPosition`.
- [x] Add targeted unit tests for address-only usage.
- [x] Run focused tests and typecheck.

## Review
- `src/erc20/erc20.ts`: `balanceOf` now accepts `WalletInterface | Address` and resolves address internally.
- `src/staking/staking.ts`: `getPosition` now accepts `WalletInterface | Address` and resolves address internally.
- `tests/erc20.test.ts`: added coverage for `erc20.balanceOf(address)`.
- `tests/staking-readonly.test.ts`: added coverage for `staking.getPosition(address)` and compatibility with wallet input.
- Verification:
  - `npx vitest run tests/erc20.test.ts tests/staking-readonly.test.ts`
  - `npm run -s typecheck`

# Task: Utility Dedup Audit (Follow-up)

## Plan
- [x] Scan `src/` for duplicated resolver/validation logic patterns.
- [x] Refactor remaining clear duplication into shared helpers.
- [x] Re-run targeted tests and typecheck.

## Review
- Moved wallet/address resolution into shared helper in `src/types/address.ts` and reused from:
  - `src/erc20/erc20.ts`
  - `src/staking/staking.ts`
- Moved duplicate token-amount compatibility checks into shared helper:
  - Added `assertAmountMatchesToken` in `src/types/amount.ts`
  - Reused from `src/erc20/erc20.ts` and `src/staking/staking.ts`
- Updated tests impacted by internal method removal:
  - `tests/staking-readonly.test.ts`
  - `tests/staking-auto-stake.test.ts`
- Verification:
  - `npx vitest run tests/erc20.test.ts tests/staking-readonly.test.ts tests/staking-auto-stake.test.ts tests/wallet.test.ts`
  - `npm run -s typecheck`

# Task: CI Lockfile Sync + MCP Rename

## Plan
- [x] Keep intended MCP rename changes (`starkzap-mcp`) and update stale references.
- [x] Regenerate root lockfile with workspace entries.
- [x] Verify `npm ci` succeeds with synced lockfile.
- [x] Run targeted follow-up checks.

## Review
- Kept and completed MCP rename edits in:
  - `packages/mcp-server/package.json`
  - `packages/mcp-server/package-lock.json`
  - `packages/mcp-server/src/index.ts`

# Task: DCA Logical Commit Push (2026-03-11)

## Plan
- [x] Inspect the current DCA-related diff and split it into coherent commit boundaries.
- [ ] Create separate commits for SDK changes, web example changes, and mobile example changes.
- [ ] Verify each staged diff before committing.
- [ ] Push the branch and record the resulting commit hashes.

## Review
- Pending.
- Updated outdated package-name reference in:
  - `packages/mcp-server/README.md`
- Regenerated root lockfile to include workspace graph (`packages/mcp-server`) and its dependencies:
  - `package-lock.json`
- Verification:
  - `npm ci --ignore-scripts` (passes locally)
  - `npm run -s typecheck` (root passes)
  - `npm run -s test --workspace packages/mcp-server` (passes)
  - `npm run -s typecheck --workspace packages/mcp-server` (fails with existing type errors in `packages/mcp-server/src/index.ts`, unrelated to lockfile sync)

# Task: PR #55 Code Review

## Plan
- [x] Identify the PR base/head commits and changed file set.
- [x] Review the diff for correctness, regressions, API consistency, and boundary issues.
- [x] Check affected tests and coverage gaps.
- [x] Run targeted validation where feasible.
- [x] Summarize findings with precise file references.
- [x] Refresh local PR ref/worktree to latest upstream head before finalizing review.

## Review
- Reviewed `upstream/main...upstream/pr-55` (26 files, lending/Vesu feature set plus builder and wallet integration).
- Verified locally in isolated worktree `/tmp/starkzap-pr55`:
  - `rtk vitest run tests/lending-vesu-provider.test.ts tests/lending-wallet.test.ts tests/tx-builder.test.ts`
  - `npm run -s typecheck`
  - `rtk vitest run tests/__tmp_review_quoteHealth.test.ts` (throwaway repro on stale commit `fdfb8f7`, then removed)
- Follow-up:
  - Fetched latest PR head and advanced `/tmp/starkzap-pr55` from `fdfb8f7` to `3f87c09` (`fix: guard lending quote targets and vesu writes`).
  - Re-verified latest head with:
    - `rtk vitest run tests/lending-vesu-provider.test.ts tests/lending-wallet.test.ts`
    - `npm run -s typecheck`
- Updated outcome:
  - The latest PR commit explicitly rejects mismatched `quoteHealth()` targets in `src/lending/client.ts`.
  - The latest PR commit also rejects delegated Vesu borrow/repay and delegated withdraw owner overrides in `src/lending/vesu/provider.ts`.
  - The earlier findings applied to stale commit `fdfb8f7` and no longer reproduce on latest head `3f87c09`.

# Task: PR #55 Re-review (Latest Head)

## Plan
- [x] Re-read the latest `upstream/pr-55` diff against `upstream/main`.
- [x] Re-evaluate risky lending, wallet, and tx-builder paths for regressions.
- [x] Re-check tests for missing coverage around the updated behavior.
- [x] Re-run focused validation on the latest PR head.
- [x] Record final findings or explicitly state none remain.

## Review
- Latest reviewed head: `3f87c09` (`fix: guard lending quote targets and vesu writes`).
- Reviewed implementation in:
  - `src/lending/client.ts`
  - `src/lending/interface.ts`
  - `src/lending/utils.ts`
  - `src/lending/vesu/provider.ts`
  - `src/wallet/base.ts`
  - `src/wallet/interface.ts`
  - `src/wallet/index.ts`
  - `src/sdk.ts`
  - `src/tx/builder.ts`
- Reviewed coverage in:
  - `tests/lending-wallet.test.ts`
  - `tests/lending-vesu-provider.test.ts`
  - `tests/lending-vesu-sepolia-live.test.ts`
  - `tests/tx-builder.test.ts`
- Validation on latest head:
  - `rtk vitest run tests/lending-vesu-provider.test.ts tests/lending-wallet.test.ts`
  - `rtk vitest run tests/lending-vesu-provider.test.ts tests/lending-wallet.test.ts tests/tx-builder.test.ts`
  - `rtk vitest run --project unit`
  - `npm run -s typecheck`
  - `npm run -s build`
- Outcome:
  - No confirmed correctness/regression findings remain on latest head `3f87c09`.
  - The prior quote-target and delegated Vesu write issues were fixed by the latest PR commit.
  - Residual review note only: `quoteHealth()` now treats provider equality conservatively by resolved object identity, which is stricter than provider id equality but appears intentional to avoid mixing differently configured provider instances.

# Task: spiritclawd PR Triage

## Plan
- [x] List open and recent PRs authored by `spiritclawd` against `keep-starknet-strange/starkzap`.
- [x] Inspect each PR’s scope, diff quality, and test posture.
- [x] Decide whether each PR appears worth a human review or is low-signal/sloppy.
- [x] Record the recommendation and supporting evidence.

## Review
- `#63` is not worth a normal review pass in its current form: ~22k LOC, mixes a Privy example with unrelated core SDK address-query changes and a massive lockfile update.
- `#68` is not cleanly reviewable as a cartridge fix: it still carries sponsorship error/wallet API changes and a lockfile diff unrelated to the stated fix.
- `#69` is similarly stacked: lending/rewards changes also include sponsorship error infrastructure and wallet type changes, with no targeted tests in the PR.
- `#73` is not scoped to rewards only: it includes the full Tongo module and wallet-base changes, so a reviewer cannot evaluate rewards support in isolation.
- `#70` is worth reviewing first: small scope, clear API goal, targeted tests included, and the diff mostly matches the stated behavior.
- `#66` is reviewable but should be handled carefully: moderate size, public API/error-surface changes, no tests in the changed files list.
- `#67` is reviewable if the feature is wanted: self-contained module plus dedicated tests, though it is product-scope heavy rather than infrastructure.
- `#71` is not obvious slop, but it is a large protocol integration with wallet-surface changes and no tests in the PR, so it is expensive to review.
- `#72` is an example/UI dump: review only if the repo actively wants that example, otherwise it is low priority and high-effort.

# Task: PR Duplicate Audit

## Plan
- [x] Fetch the current PR list and metadata for `keep-starknet-strange/starkzap`.
- [x] Compare PRs by title, branch ancestry, and changed-file overlap.
- [x] Flag likely duplicates or stacked supersets with supporting evidence.
- [x] Record the review outcome.

## Review
- Definite duplicate/superset cluster: `#62` and `#71`.
  - `#71` explicitly says it “closes #62”.

# Task: PR #51 Code Review

## Plan
- [x] Fetch the latest `upstream/pr-51` ref and compare it to the local review state.
- [x] Review the diff against `upstream/main` for correctness, regressions, API consistency, and scope hygiene.
- [x] Inspect affected tests and coverage gaps.
- [x] Run targeted validation for the changed areas where feasible.
- [x] Record findings with precise file references and a review summary.

## Review
- Latest reviewed head: `ed63f9b` (`feat(payment): add step-by-step guide for creating payment sessions and modal integration`).
- Scope reviewed:

  - Payment SDK surface in `src/payment/*`, `src/sdk.ts`, `src/types/config.ts`, `src/index.ts`
  - Payment tests in `tests/payment.test.ts`
  - New Chainrails Next.js example and workspace/package metadata
- Validation:
  - `rtk git fetch upstream pull/51/head:refs/remotes/upstream/pr-51`
  - `npm ci --ignore-scripts` in isolated worktree `/tmp/starkzap-pr51` -> fails because lockfile is out of sync (`Missing: @types/react-dom@19.2.3 from lock file`)
  - `npm install --ignore-scripts` in `/tmp/starkzap-pr51`
  - `npm run -s typecheck`
  - `rtk vitest run tests/payment.test.ts`
  - `npm run -s build`
  - `npm run -s build --workspace examples/chainrails-nextjs-example` -> fails while prerendering `/`
  - `node --import tsx -e "import { Payment } from './src/payment/payment.ts'; import { Chainrails } from '@chainrails/sdk'; new Payment({ apiKey: 'real_key' }); console.log(Chainrails.getApiKey()); new Payment({ apiKey: '' }); console.log(Chainrails.getApiKey());"` -> confirms later empty-key `Payment` instances overwrite the global Chainrails auth state
  - `node --import tsx -e "import { Payment } from './src/payment/payment.ts'; const payment = new Payment({ apiKey: '' }); payment.modal({ sessionToken: 'tok_123' }).pay().catch((error) => console.error(String(error)));" ` -> throws `TypeError: Unknown file extension ".css"` before the browser guard runs
- Findings:
  - Root `package-lock.json` is not synchronized with the new Next.js workspace dependency graph, so fresh `npm ci` fails before any checks can run.
  - The new Next.js example eagerly calls `sdk.payment()` during component render, which executes during Next prerender/build and crashes the example with `Payment is not configured...`.
  - `sdk.payment()` without config now creates `new Payment({ apiKey: "" })` in browser runtimes, and the `Payment` constructor reconfigures the global Chainrails singleton, so calling the fallback path after a configured instance wipes the real API key for later authenticated requests.
  - `payment.modal().pay()` in non-browser runtimes imports `@chainrails/vanilla` before `assertBrowser()`, so it fails with a package import/runtime error instead of the intended `requires a browser environment` error.
  - Example-scope check: this PR does not only modify existing examples. It adds a new example workspace at `examples/chainrails-nextjs-example/` (absent from `upstream/main`, present on `upstream/pr-51`) and wires it into CI with a dedicated build step.
  - Existing example modifications are limited to `examples/flappy-bird/` and `examples/server/`; `examples/web/` and `examples/mobile/` are unchanged in this PR.

# Task: PR #51 Thorough Review

## Plan
- [x] Re-read the full diff by area: SDK runtime, examples, tests, CI/workspace metadata, and docs.
- [x] Validate changed runtime behavior with focused commands and direct repros where needed.
- [x] Check existing and missing test coverage for the confirmed risks.
- [x] Record the final review findings with severity, repro evidence, and exact file references.

## Review
- Re-reviewed latest head `ed63f9b` across:
  - SDK payment runtime: `src/payment/*`, `src/sdk.ts`, `src/types/config.ts`, `src/index.ts`
  - Examples: `examples/chainrails-nextjs-example/*`, `examples/flappy-bird/*`, `examples/server/*`
  - Tests/docs/CI/workspace metadata: `tests/payment.test.ts`, `.github/workflows/ci.yml`, `package.json`, `package-lock.json`, `mintlify-docs/build/consumer-app-sdk/payment.mdx`, `README.md`
- Validation:
  - `npm ci --ignore-scripts` in `/tmp/starkzap-pr51` -> fails: `Missing: @types/react-dom@19.2.3 from lock file`
  - `npm install --ignore-scripts` in `/tmp/starkzap-pr51`
  - `npm run -s typecheck`
  - `rtk vitest run tests/payment.test.ts`
  - `npm run -s build`
  - `npm run -s build --workspace examples/flappy-bird`
  - `npm run -s build --workspace examples/web`
  - `npm run -s build --workspace examples/chainrails-nextjs-example` -> fails while prerendering `/`
  - `node --import tsx -e "import { StarkZap } from './src/sdk.ts'; import { Chainrails } from '@chainrails/sdk'; const configured = new StarkZap({ network: 'mainnet', payment: { apiKey: 'real_key' } }); configured.payment(); globalThis.window = {}; globalThis.document = { createElement() { return {}; } }; const browserFallback = new StarkZap({ network: 'mainnet' }); browserFallback.payment(); console.log(Chainrails.getApiKey());"` -> confirms browser fallback clears previously configured API key
  - `node --import tsx -e "import { Payment } from './src/payment/payment.ts'; import { Chainrails, crapi } from '@chainrails/sdk'; crapi.auth.getSessionToken = async () => ({ sessionToken: 'sess_123', amount: '25.00' }); const payment = new Payment({ apiKey: 'real_key' }); await payment.createSession({ recipient: '0x1', token: 'USDC', destinationChain: 'STARKNET', amount: '25.00' }); console.log(Chainrails.getSessionToken());"` -> confirms `createSession()` does not persist session token for later `getSession*` calls
  - `node --import tsx -e "import { Payment } from './src/payment/payment.ts'; const payment = new Payment({ apiKey: '' }); payment.modal({ sessionToken: 'tok_123' }).pay().catch((error) => console.error(String(error)));" ` -> throws `TypeError: Unknown file extension ".css"` before the browser guard runs
- Findings:
  - Clean installs fail because the root `package-lock.json` is out of sync with the new Next.js workspace manifest.
  - The new Next.js example is not buildable because its page component eagerly calls `sdk.payment()` during prerender.
  - The session-scoped payment API is internally inconsistent: `createSession()` returns a token, but the class stores no session token state and later `getSession*` methods accept no token, so “requires prior createSession call” does not hold.
  - Browser fallback `sdk.payment()` calls clear previously configured Chainrails API keys because the wrapper mutates the global Chainrails singleton with `apiKey: ""`.
  - The Next.js example setup docs are wrong: README and `.env.example` define `NEXT_PUBLIC_CHAINRAILS_API_KEY`, while the API route reads `CHAINRAILS_API_KEY`.
  - `payment.modal().pay()` in non-browser runtimes fails during import of `@chainrails/vanilla` instead of surfacing the intended browser-environment error.
- Coverage gap: `tests/payment.test.ts` does not exercise `getSessionQuotes`, `createSessionIntent`, `getSessionIntents`, `triggerSessionProcessing`, or `getSessionClientInfo`.

# Task: PR #51 Comment Posting

## Plan
- [x] List the confirmed review findings and check which comments are already posted on PR 51.
- [x] Post the remaining inline comments to the PR without duplicating the existing README comment.
- [x] Verify the created comment links and report completion.

## Review
- Verified existing PR comments first, then posted the remaining review comments plus the explicit scope comment about the new example workspace.
- Verification: `gh api 'repos/keep-starknet-strange/starkzap/pulls/51/comments?per_page=100' --jq 'map(select(.user.login=="0xLucqs")) | length'` -> `8`
  - `#62` adds the confidential module via `src/confidential/*` plus builder/tests.
  - `#71` re-implements the same Tongo/confidential feature set under `src/tongo/*` and `src/wallet/base.ts`.
- Definite stacked duplicate: `#71` is effectively embedded inside `#73`.
  - Every Tongo file in `#71` also appears in `#73`: `src/abi/tongo.ts`, `src/index.ts`, `src/tongo/index.ts`, `src/tongo/tongo.ts`, `src/tongo/types.ts`, `src/wallet/base.ts`.
  - `#73` then adds Vesu rewards files on top, so it is not a clean standalone rewards PR.
- Partial duplicate/stacked scope: `#54` and `#68`.
  - `#54` is the sponsorship error/fallback PR.
  - `#68` is framed as a Cartridge dynamic-import fix, but its summary and shared file set (`src/types/wallet.ts`, `src/wallet/cartridge.ts`, `src/wallet/index.ts`) show it also carries the sponsorship fallback work.
- Partial duplicate/stacked scope: `#61` and `#63`.
  - `#61` is the focused read-only address query PR.
  - `#63` is primarily a Privy example, but it also includes the same address-query feature in `src/erc20/erc20.ts`, `src/staking/staking.ts`, and type exports.
- Checked and not duplicates:
  - `#59` vs `#72`: both are dashboard examples, but `#59` is npm download analytics while `#72` is an SDK wallet dashboard; `#72` explicitly calls out that it is different from `#59`.
  - `#11` vs `#13`: `#13` is a follow-up PR targeting branch `feat/ethereum-signer`, not a duplicate PR against `main`.

# Task: PR #62 Review

## Plan
- [x] Fetch the latest `pull/62/head` ref from `upstream`.
- [x] Diff `upstream/pr-62` against `upstream/main` and inspect affected modules.
- [x] Validate the PR with targeted tests on the PR head.
- [x] Record review findings focused on coherence with existing codebase patterns.

## Review
- Findings:
  - `src/confidential/confidential.ts` uses `Amount` but stores no token metadata and performs no `assertAmountMatchesToken`-style validation before forwarding `amount.toBase()` into Tongo operations. Unlike `Erc20`/`Staking`, this wrapper cannot catch token/decimal mismatches, so `Amount.parse("1", USDC)` can be silently treated as the confidential token’s raw units.
  - `src/tx/builder.ts` exposes `confidential*()` helpers that still require `details.sender`, even though every other builder helper derives the sender from `this.wallet.address`. That makes the builder easy to misuse with mismatched wallet/sender combinations and breaks the existing fluent API shape.
  - `src/confidential/confidential.ts` drops the underlying Tongo `approve` call from `fund()` and forces callers to manually compose a separate ERC20 approval. Existing high-level helpers (`Staking.populateEnter`, `Staking.populateAdd`) return the full call sequence needed for a safe batch, so this confidential wrapper is a step down in ergonomics and correctness.
  - The PR adds `tests/integration/confidential.test.ts`, but `.github/workflows/ci.yml` still never runs `npm run -s test:integration`, so the new protocol-level coverage is not part of the branch’s required checks.
- Verification:
  - `git fetch upstream pull/62/head:refs/remotes/upstream/pr-62`
  - `vitest run tests/confidential.test.ts tests/tx-builder.test.ts --project unit` on the PR head: passed
  - `vitest run tests/integration/confidential.test.ts --project integration` on the PR head: blocked in this environment because `tests/integration/globalSetup.ts` tries to resolve `api.github.com` to fetch `starknet-devnet`

# Task: PR #62 Re-review (Latest Head)

## Plan
- [x] Refresh `upstream/pr-62` to the latest remote head and confirm the reviewed commit.
- [x] Re-read the `upstream/main...upstream/pr-62` diff for correctness, regressions, and API consistency.
- [x] Inspect the new confidential and tx-builder tests for coverage gaps.
- [x] Attempt targeted validation for the changed areas.
- [x] Record final findings with precise file references.

## Review
- Latest reviewed head: `4b14427` (`refactor: add address and rate conversion to ConfidentialProvider interface`).
- Reviewed scope:
  - `src/confidential/index.ts`
  - `src/confidential/interface.ts`
  - `src/confidential/tongo.ts`
  - `src/confidential/types.ts`
  - `src/tx/builder.ts`
  - `tests/confidential.test.ts`
  - `tests/integration/confidential.test.ts`
  - `tests/integration/tongo-state/regenerate.mjs`
  - `.github/workflows/ci.yml`
- Findings:
  - `src/confidential/tongo.ts` drops Tongo's generated `approve` leg and only returns `op.toCalldata()`, but the new builder/docs tell callers to reuse the same `amount` for both ERC20 approval and confidential funding. Tongo's own docs distinguish confidential units from ERC20 units and expose `tongoToERC20()` for the conversion, so this wrapper can batch an under-approved fund call whenever the configured rate is not 1:1.
  - `tests/integration/confidential.test.ts` and `tests/integration/tongo-state/regenerate.mjs` use `Devnet.spawnInstalled()` against a checked-in dump file instead of pinning the devnet version. The repo's main integration harness pins `v0.7.2`; these new tests do not, so the committed `devnet.state` becomes sensitive to whichever local binary version happens to be installed.
- Validation:
  - `rtk git fetch upstream pull/62/head:refs/remotes/upstream/pr-62`
  - Static review in detached worktree `/tmp/starkzap-pr62-review`
  - Attempted `rtk proxy npm ci --ignore-scripts` in `/tmp/starkzap-pr62-review`, but direct test execution remained blocked in this environment because dependencies are not installed locally and network access is restricted.

# Task: Mobile Example Vesu Integration

## Plan
- [x] Inspect the existing mobile example screens and reuse the current wallet/balance/toast patterns for a Vesu tab.
- [x] Add a dedicated Vesu tab and screen that loads Vesu markets, shows position/health data, and supports deposit, withdraw, withdraw max, borrow, and repay flows through `wallet.lending()`.
- [x] Extract pure Vesu helper logic from the screen so the selection/formatting behavior can be unit tested cleanly.
- [x] Add targeted tests for the extracted Vesu helper functions.
- [x] Run focused validation for the mobile example changes and record the results.

## Review
- Added a new `Vesu` tab to the Expo example and wired it through:
  - `examples/mobile/app/(tabs)/_layout.tsx`
  - `examples/mobile/components/ui/icon-symbol.tsx`
- Implemented the screen in `examples/mobile/app/(tabs)/vesu.tsx`:
  - loads SDK market metadata through `wallet.lending().getMarkets({ provider: "vesu" })` and merges it with live Vesu stats from `https://api.vesu.xyz/markets` when available
  - now uses Vesu Lite-style market cards with token header, total supplied, total borrowed, supply APR, borrow APR, collateral row, and a market CTA
  - preserves distinct markets per pool instead of flattening identical token symbols together, while still showing the pool label on each card
  - keeps dropdown selectors only where they remain necessary (`Debt Market` and `Collateral Asset` in the borrow/repay panel)
  - restricts asset selection to Vesu market assets only, with a minimal explicit fallback list when metadata is unavailable (notably on Sepolia)
  - supports deposit, withdraw, withdraw max, borrow, repay, and health previews
  - reuses existing wallet disconnect, balance refresh, logging, and transaction toast patterns
- Extracted pure helper logic to `examples/mobile/vesu/index.ts` for:
  - Vesu asset option construction and fallback behavior
  - live Vesu market-card construction and stat formatting
  - default vault/debt/collateral selection within the Vesu-supported asset set
  - health/LTV/USD formatting
  - open-position detection
- Updated `examples/mobile/README.md` to document the new Vesu screen.
- Added focused helper coverage in `tests/mobile-vesu.test.ts`.
- Verification:
  - `rtk vitest run tests/mobile-vesu.test.ts`
  - `rtk proxy npm run -s build:all`
  - `rtk proxy npm exec -w starkzap-example-mobile tsc -- --noEmit`
  - `rtk proxy npm exec -w starkzap-example-mobile eslint -- 'app/(tabs)/vesu.tsx' vesu/index.ts`
  - `rtk proxy npm run -s typecheck`

# Task: Mobile Example Vesu Interaction Cleanup

## Plan
- [x] Rework the Vesu mobile screen so tapping a market card opens a market-specific action surface instead of updating hidden global state.
- [x] Align the market detail flow with the desktop Vesu pattern: fixed selected asset, `Supply`/`Borrow` tabs, and market-specific stats in the opened view.
- [x] Make the borrow path explicitly require either existing collateral exposure or a collateral amount in the same flow before submit/preview is enabled.
- [x] Re-run focused Vesu validation and record the outcome.

## Review
- Reworked `examples/mobile/app/(tabs)/vesu.tsx` so the market grid is now the entry point instead of a selector for hidden lower panels.
- Tapping a market card now opens a market-specific sheet with:
  - fixed selected asset and pool header
  - market stats and same-pool collateral row at the top
  - `Supply` / `Borrow` tabs that match the desktop interaction model more closely
- The supply tab now owns deposit/withdraw for the selected market asset.
- The borrow tab is now market-scoped as well:
  - the debt asset is fixed to the selected card instead of using a separate debt-market dropdown
  - collateral remains selectable from same-pool assets only
  - preview/submit stay disabled while position data is loading
  - if there is no existing exposure for the selected collateral/debt pair, the UI explicitly asks for collateral and requires a collateral amount before `borrow` can be previewed or submitted
- Main-screen copy was updated so it tells the user to tap a market card to open the flow, instead of implying there are action panels elsewhere on the screen.
- Clarified the fallback metadata path:
  - mainnet market discovery already queries all Vesu markets through `wallet.lending().getMarkets({ provider: "vesu" })`
  - Sepolia still falls back because the current Vesu provider preset has no `marketsApiUrl`, so the UI now says `Pool unavailable` instead of the misleading `Default Pool`
- Verification:
  - `rtk proxy npx prettier --write /Users/lucas/x/examples/mobile/app/'(tabs)'/vesu.tsx`
  - `rtk vitest run tests/mobile-vesu.test.ts`
  - `rtk proxy npm exec -w starkzap-example-mobile tsc -- --noEmit`
  - `rtk proxy npm exec -w starkzap-example-mobile eslint -- 'app/(tabs)/vesu.tsx' vesu/index.ts`
  - `rtk proxy npm run -s typecheck`

# Task: Vesu Sepolia Markets URL Check

## Plan
- [x] Check whether Vesu documents or exposes a Sepolia-specific markets API URL or query parameter.
- [x] Compare the main `api.vesu.xyz/markets` payload with obvious Sepolia query variants.
- [x] Record whether the mobile example can switch from fallback data to a real Sepolia markets URL.

## Review
- Mainnet market discovery URL remains `https://api.vesu.xyz/markets`.
- Probed `https://api.vesu.xyz/markets?chain=SN_SEPOLIA` and `https://api.vesu.xyz/markets?chainId=SN_SEPOLIA`; both returned HTTP 200 but the same `107`-market payload as mainnet.
- The returned pool names for those query variants are still mainnet pools (`Genesis`, `Prime`, `Braavos Vault`, etc.), so the Sepolia query parameters are not changing the dataset.
- `https://api-sepolia.vesu.xyz/markets` did not resolve.
- Conclusion: no public Sepolia markets URL was confirmed from Vesu’s current public API surface in this check, so the mobile example cannot just swap in a missing URL today. A real fix would require either:
  - on-chain pool/market discovery from the Vesu pool factory, or
  - an official Sepolia markets endpoint from Vesu.

# Task: Mobile Network Selector Mismatch

## Plan
- [x] Inspect the mobile onboarding selector, wallet store, and balance fetch path to find why token addresses from one network were being queried through another network provider.
- [x] Fix the selector/configuration flow so changing the selected network after initial configuration does not silently desync the displayed `chainId` from the active SDK/wallet RPC.
- [x] Add focused regression coverage for the network-selection state transition and re-run targeted mobile validation.

## Review
- Root cause:
  - once the onboarding flow was already `isConfigured`, tapping a different network pill updated the store `chainId` and `rpcUrl`, but did not rebuild the active `sdk`
  - the configured step-1 flow then advanced with `setLoginStep(1)` instead of calling `confirmNetworkConfig()`
  - that let the UI/token registry reflect one network while the wallet/provider still pointed at the previous RPC, which matches the `contract not found` balance errors for mainnet tokens on Sepolia
- Fixes:
  - added `getNetworkSelectionPatch()` in `examples/mobile/network-selection.ts`
  - updated `examples/mobile/stores/wallet.ts` so selecting a network after configuration only changes the pending `selectedNetworkIndex`; active `chainId`/`rpcUrl` stay unchanged until reconfirmed
  - updated both configured onboarding flows in `examples/mobile/app/index.tsx` so step 1 now uses `handleNext`, which reruns `confirmNetworkConfig()` before proceeding
  - removed a few existing unused locals in `examples/mobile/app/index.tsx` while touching the file
- Tests:
  - added `tests/mobile-network-selection.test.ts` to lock the pending-vs-active network behavior
- Verification:
  - `rtk proxy npx prettier --write /Users/lucas/x/examples/mobile/network-selection.ts /Users/lucas/x/examples/mobile/stores/wallet.ts /Users/lucas/x/examples/mobile/app/index.tsx /Users/lucas/x/tests/mobile-network-selection.test.ts`
  - `rtk vitest run tests/mobile-network-selection.test.ts tests/mobile-vesu.test.ts`
  - `rtk proxy npm exec -w starkzap-example-mobile tsc -- --noEmit`
  - `rtk proxy npm exec -w starkzap-example-mobile eslint -- 'app/index.tsx' stores/wallet.ts network-selection.ts 'app/(tabs)/vesu.tsx' vesu/index.ts`
  - `rtk proxy npm run -s typecheck`

# Task: Vesu Pool Logo Fallbacks

## Plan
- [x] Inspect the current Vesu mobile market-card rendering and verify whether official pool logo URLs are available from the current Vesu API surface.
- [x] Add a deterministic pool-avatar fallback so every pool has visible branding in the card list and detail sheet even when the API only provides pool names.
- [x] Re-run focused Vesu/mobile validation and record the outcome.

## Review
- Checked Vesu’s public API:
  - `https://api.vesu.xyz/markets` includes pool names/owners but no explicit pool logo URL
  - `https://api.vesu.xyz/pools` provides richer pool metadata and pairs, but still no logo asset field
- Added `getVesuPoolVisual()` in `examples/mobile/vesu/index.ts`:
  - known pools get stable brand-style monograms (`Prime`/`Genesis` => `V`, `Braavos Vault` => `B`, etc.)
  - unknown pools get deterministic initials and a hashed fallback color palette
  - `Pool unavailable` gets an explicit `?` badge instead of looking broken
- Updated `examples/mobile/app/(tabs)/vesu.tsx` so market cards and the opened market sheet both render a pool avatar next to the pool label.
- Expanded `tests/mobile-vesu.test.ts` to cover the new pool visual helper.
- Verification:
  - `rtk proxy npx prettier --write /Users/lucas/x/examples/mobile/vesu/index.ts /Users/lucas/x/examples/mobile/app/'(tabs)'/vesu.tsx /Users/lucas/x/tests/mobile-vesu.test.ts`
  - `rtk vitest run tests/mobile-vesu.test.ts tests/mobile-network-selection.test.ts`
  - `rtk proxy npm exec -w starkzap-example-mobile tsc -- --noEmit`
  - `rtk proxy npm exec -w starkzap-example-mobile eslint -- 'app/(tabs)/vesu.tsx' vesu/index.ts 'app/index.tsx' stores/wallet.ts network-selection.ts`
  - `rtk proxy npm run -s typecheck`

# Task: Mobile Vesu Cleanup Review

## Plan
- [x] Inspect the recent mobile Vesu and network-selection changes for dead state, stale helper exports, and unused UI data.
- [x] Remove any confirmed useless additions while preserving the current lend/borrow flow.
- [x] Re-run targeted mobile tests, typecheck, and lint for the touched files.
- [x] Record the cleanup outcome and any residual risks.

## Review
- Removed stale market-selection state from `examples/mobile/app/(tabs)/vesu.tsx`:
  - dropped `selectedDebtAssetKey`, which no longer changed anywhere after moving to card-driven market selection
  - simplified `selectedDebtAsset` to derive directly from the selected market card
  - collapsed `describeAssetOption()` into a collateral-specific helper because the screen no longer exposes vault/debt dropdowns
- Removed stale helper surface from `examples/mobile/vesu/index.ts`:
  - dropped unused `VESU_ACTIONS` / `VesuAction`
  - removed `hasLiveStats` from `VesuMarketCard` because no UI branch consumed it
  - removed old default vault/debt helper exports that were only leftovers from the earlier selector flow
  - made pool grouping internal instead of exporting it just for tests
- Updated `tests/mobile-vesu.test.ts` to validate the same behaviors through the live helper surface rather than the removed stale exports.
- Residual note:
  - kept `examples/mobile/network-selection.ts` even though it is small, because it isolates the pending-vs-active network transition and carries the regression test for the network mismatch bug.
- Verification:
  - `rtk proxy npx prettier --write /Users/lucas/x/examples/mobile/vesu/index.ts /Users/lucas/x/examples/mobile/app/'(tabs)'/vesu.tsx /Users/lucas/x/tests/mobile-vesu.test.ts /Users/lucas/x/tasks/todo.md`
  - `rtk vitest run tests/mobile-vesu.test.ts tests/mobile-network-selection.test.ts`
  - `rtk proxy npm exec -w starkzap-example-mobile tsc -- --noEmit`
  - `rtk proxy npm exec -w starkzap-example-mobile eslint -- 'app/(tabs)/vesu.tsx' vesu/index.ts 'app/index.tsx' stores/wallet.ts network-selection.ts`
  - `rtk proxy npm run -s typecheck`

# Task: Mobile Vesu Token Logo Resolution

## Plan
- [x] Inspect the Vesu market-card token metadata path to identify why some pool tokens render without logos.
- [x] Improve display-token resolution so market cards and collateral rows can inherit known token logos without changing transaction token addresses.
- [x] Add focused regression coverage and rerun the mobile validation set.

## Review
- Root cause:
  - `examples/mobile/vesu/index.ts` only reused token metadata when a Vesu market asset address exactly matched a token in the mobile preset list.
  - some Vesu market assets arrive without local metadata even though the app already knows the same token symbol and logo from a different preset entry, so the UI fell back to initials instead of a token logo.
- Fixes:
  - added a display-token lookup in `examples/mobile/vesu/index.ts` that prefers exact address matches, then falls back to known tokens with the same symbol or name when those known tokens carry a logo
  - preserved the original market token addresses when borrowing/lending, and only merged display metadata for UI rendering
  - applied that resolver to both the card header token and same-pool collateral token badges so the whole market view stays consistent
- Tests:
  - updated `tests/mobile-vesu.test.ts` to cover metadata reuse by exact address and by symbol when the Vesu market token address differs from the preset token address
- Verification:
  - `rtk vitest run tests/mobile-vesu.test.ts tests/mobile-network-selection.test.ts`
  - `rtk proxy npm exec -w starkzap-example-mobile tsc -- --noEmit`
  - `rtk proxy npm exec -w starkzap-example-mobile eslint -- 'app/(tabs)/vesu.tsx' vesu/index.ts 'app/index.tsx' stores/wallet.ts network-selection.ts`
  - `rtk proxy npm run -s typecheck`

# Task: Mobile In-App Network Switching

## Plan
- [x] Inspect the current connected-session network access points and wallet lifecycle to identify why switching still requires disconnecting.
- [x] Add an atomic wallet-store network switch path and a shared connected header so the active wallet session can move networks without manual disconnect.
- [x] Update the affected mobile tabs to use the shared header and preserve screen-specific refresh/cache behavior.
- [x] Run targeted mobile validation and record the result plus the lesson learned.

## Review
- Root cause:
  - once the app was already configured and connected, the only visible network controls lived on the onboarding screen
  - changing networks in the configured flow updated pending selection state, but the active connected screens had no in-app way to rebuild the SDK and wallet session without a full disconnect/reset
- Fixes:
  - added an atomic `switchNetwork()` path in `examples/mobile/stores/wallet.ts` that builds the next SDK first, reconnects the current wallet session on the target chain, and only then swaps `sdk`, `rpcUrl`, `chainId`, and `wallet`
  - persisted the active Privy session identifiers (`privyWalletId`, `privyPublicKey`) so a connected Privy wallet can be re-onboarded on a new network using a fresh access token instead of forcing logout
  - reduced the UI surface back to the minimum connected entry point:
    - `examples/mobile/app/(tabs)/balances.tsx` now owns the network picker modal and connected-session switch action
    - the other tabs keep their existing local headers and disconnect behavior instead of adopting a shared cross-tab header abstraction
  - kept only the tab-specific state resets that are actually needed when a hidden tab survives a chain change:
    - `examples/mobile/app/(tabs)/transfers.tsx` resets draft transfers on `chainId` change
    - `examples/mobile/app/(tabs)/staking.tsx` clears cached staking positions on `chainId` change
    - `examples/mobile/app/(tabs)/vesu.tsx` closes and resets the active market sheet on `chainId` change
- Verification:
  - `rtk vitest run tests/mobile-network-selection.test.ts tests/mobile-vesu.test.ts`
  - `rtk proxy npm exec -w starkzap-example-mobile tsc -- --noEmit`
  - `rtk proxy npm exec -w starkzap-example-mobile eslint -- 'app/(tabs)/balances.tsx' 'app/(tabs)/swap.tsx' 'app/(tabs)/transfers.tsx' 'app/(tabs)/staking.tsx' 'app/(tabs)/vesu.tsx' stores/wallet.ts network-selection.ts`
  - `rtk proxy npm run -s typecheck`
- Residual note:
  - I did not run the Expo app interactively here, so the runtime confirmation still depends on you switching networks from a connected tab in the mobile UI.

# Task: DCA Logical Commit Push (2026-03-11)

## Plan
- [x] Inspect the current DCA-related diff and split it into coherent commit boundaries.
- [x] Create separate commits for SDK changes, web example changes, and mobile example changes.
- [x] Verify each staged diff before committing.
- [x] Push the branch and record the resulting commit hashes.

## Review
- Pushed branch: `origin/feat/dca`
- Commit split:
  - `1d2a223` `feat(sdk): add dca providers and wallet support`
  - `bca5228` `feat(examples-web): add dca demo flow`
  - `af66a9c` `feat(examples-mobile): add dca demo flow`
- Commit verification:
  - inspected each staged diff with `rtk git diff --cached --stat` before committing
  - repo is clean after push (`rtk git status --branch --short`)
- Note:
  - this preserves the current implementation split exactly as pushed; it does not change the earlier architectural caveat that AVNU uses a hosted DCA backend while the current Ekubo DCA path is a client-side integration over Ekubo APIs/contracts.

# Task: AVNU DCA Clarity Cleanup (2026-03-11)

## Plan
- [x] Review `src/dca/avnu.ts` to separate useful adapter boundaries from trivial helper indirection.
- [x] Simplify the file so validation, mapping, and API fallback remain explicit while one-line wrappers are inlined.
- [x] Run focused AVNU DCA validation and root typecheck.

## Review
- Simplified `src/dca/avnu.ts` to privilege direct readability:
  - removed the one-line `toHexQuantity`, `getErrorMessage`, `parseOptionalBigInt`, and `mapOrdersPage` helpers
  - kept the helpers that still isolate meaningful boundaries: `toPricingStrategy`, `validateCreateRequest`, `mapPricingStrategy`, `mapTrade`, `mapOrder`, and API-base fallback selection
  - made `getOrders()` read as straight-line fetch-then-map logic instead of nested helper composition
- Verification:
  - `rtk vitest run tests/dca-avnu-provider.test.ts`
  - `rtk proxy npm run -s typecheck`

# Task: Ekubo DCA Clarity Cleanup (2026-03-11)

## Plan
- [x] Review `src/dca/ekubo.ts` to separate meaningful protocol boundaries from trivial helper indirection.
- [x] Simplify the file while preserving the order-id, API parsing, timing, and on-chain call boundaries that actually carry complexity.
- [x] Run focused Ekubo DCA validation and root typecheck.

## Review
- Simplified `src/dca/ekubo.ts` for readability without changing the protocol boundary:
  - removed trivial wrappers like decimal-string/address/date/status helpers and used direct expressions where the data flow is obvious
  - made `getOrders()` linear by building parsed order descriptors once instead of encoding and then immediately decoding the same order ids
  - centralized duplicated Ekubo HTTP request/error handling in a single `fetchJson()` method, while keeping response-schema parsing separate
  - kept the helpers that still isolate real complexity: API payload parsing, duration/timing alignment, order-id encoding/decoding, request validation, and Starknet call construction
- Verification:
  - `rtk vitest run tests/dca-ekubo-provider.test.ts`
  - `rtk proxy npm run -s typecheck`
