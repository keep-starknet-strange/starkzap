# Swap Abstraction + Ekubo Integration

## Task
- [x] Investigate current wallet/tx architecture and define swap abstraction boundaries.
- [x] Implement a generic swap abstraction (`SwapAdapter`, `SwapPlan`, wallet integration).
- [x] Integrate Ekubo through a concrete adapter with chain-aware presets.
- [x] Expose swap APIs through exports and fluent `TxBuilder`.
- [x] Add/extend tests for abstraction behavior, Ekubo adapter behavior, and tx-builder chaining.
- [x] Run targeted verification (typecheck + relevant unit tests).

## Acceptance Criteria
- [x] Wallets can transform adapter swap requests into executable call arrays.
- [x] Wallets can execute swap requests in one call via a unified API.
- [x] `TxBuilder` can enqueue adapter-driven swap operations.
- [x] Ekubo integration provides usable Starknet mainnet and sepolia defaults.
- [x] New functionality is covered by deterministic unit tests.
- [x] Existing tests remain green for touched areas.

## Review
- Status: Complete
- Verification:
  - `rtk proxy npm run -s typecheck`
  - `rtk proxy npm run -s lint`
  - `rtk proxy npx vitest run --project unit tests/tx-builder.test.ts tests/swap-wallet.test.ts tests/swap-ekubo.test.ts`
  - `rtk proxy npx vitest run --project unit`
- Notes:
  - Added generic adapter-based swap abstraction.
  - Added Ekubo adapter with chain-aware extension router presets.
  - Integrated swap support into `WalletInterface`, `BaseWallet`, and `TxBuilder`.

# Mobile App Ekubo Integration

## Task
- [x] Add a dedicated Swap tab in `examples/mobile`.
- [x] Implement Ekubo swap execution flow in the mobile app using `EkuboSwapAdapter`.
- [x] Implement automatic Ekubo quote + call generation from token selection and input amount.
- [x] Reuse existing transaction UX (logs, sponsored toggle, toast, explorer links).
- [x] Update mobile README for swap usage.
- [x] Run mobile-targeted verification (`tsc` + lint for app code).

## Acceptance Criteria
- [x] Connected users can access a Swap screen from tabs.
- [x] Swap submit path calls `wallet.swap(EkuboSwapAdapter.forChain(chainId), request, options?)`.
- [x] Swap quotes are fetched from Ekubo and transformed into executable calls before submit.
- [x] Pending and confirmed swap states are shown via existing toast/log patterns.
- [x] Existing tabs (balances/transfers/staking) remain unaffected.

## Review
- Status: Complete
- Verification:
  - `rtk proxy npm --prefix examples/mobile run -s lint`
  - `rtk proxy npm run -s typecheck`
  - `rtk proxy npm run -s lint`
- Notes:
  - Added `Swap` tab and new mobile screen using `wallet.swap` + `EkuboSwapAdapter`.
  - Removed manual JSON call input and replaced it with Ekubo quote fetch + automatic call construction.
  - Refactored swap backend logic into a reusable `SwapIntegration` interface for multi-provider support.
  - Added integration modules under `examples/mobile/swaps/` (`interface.ts`, `ekubo.ts`, `index.ts`) and wired screen through this abstraction.
  - Submit now builds `transfer + swap/multihop + clear_minimum + clear` calls from quote splits.
  - Updated Ekubo router presets to deployed addresses (`SN_MAIN` and `SN_SEPOLIA`) to fix `contract not deployed` failures.
  - Expanded swap token picker from primary tokens to the broader preset token list with search.
  - Sepolia swap token defaults now prefer `USDC.e` to avoid no-liquidity `USDC` quote failures.
  - Mobile direct `tsc -p examples/mobile/tsconfig.json --noEmit` still reports existing project-level alias/export typing issues unrelated to this change set.

# TS Swap Provider Interface Cleanup

## Task
- [x] Add an SDK-level TypeScript interface for multi-provider swap preparation.
- [x] Refactor mobile swap integration types to consume the SDK contract instead of app-only duplicates.
- [x] Remove local `unknown` casts from Ekubo integration by using typed `PreparedSwap` generics.
- [x] Re-run targeted verification for touched files.

## Acceptance Criteria
- [x] A single TS interface can be implemented for multiple swap providers.
- [x] Provider implementations return typed `{ adapter, request, quote }` payloads.
- [x] Mobile swap integration composes against SDK contracts instead of redefining core swap types.
- [x] Lint/type/tests pass for touched areas (or remaining failures are documented as pre-existing).

## Review
- Status: Complete
- Verification:
  - `rtk proxy npm run -s typecheck`
  - `rtk proxy npm run -s lint`
  - `rtk proxy npx vitest run --project unit tests/swap-ekubo.test.ts tests/swap-wallet.test.ts tests/tx-builder.test.ts`
  - `rtk proxy npm --prefix examples/mobile run -s lint`
  - `rtk tsc -p examples/mobile/tsconfig.json --noEmit` (still fails with existing mobile package/linking alias issues in `starkzap` imports)
- Notes:
  - Added SDK interfaces `SwapPrepareRequest`, `SwapQuote`, `PreparedSwap`, `SwapProvider` in `src/swap/interface.ts`.
  - Mobile swap integration now composes on top of SDK swap contracts and keeps app-specific metadata in `examples/mobile/swaps/interface.ts`.
  - Ekubo mobile integration is now strongly typed (`SwapIntegration<EkuboSwapRequest>`) without `unknown` casts.

# Generic Swap Interface + AVNU

## Task
- [x] Adapt swap provider interfaces to be protocol-generic (not Ekubo-shaped).
- [x] Add SDK-level AVNU swap adapter and export it.
- [x] Implement AVNU mobile swap integration using AVNU quote/build APIs.
- [x] Register multiple swap integrations (AVNU + Ekubo) behind the same interface.
- [x] Run targeted verification and document outcomes.

## Acceptance Criteria
- [x] Shared interfaces support providers with different execution requirements (e.g., taker address, optional route metadata).
- [x] AVNU and Ekubo both implement the same integration contract consumed by the swap screen.
- [x] Swap source selection executes through the same `wallet.swap(adapter, request)` path.
- [x] Lint/type/tests pass for touched files (or remaining failures are documented as pre-existing).

## Review
- Status: Complete
- Verification:
  - `rtk proxy npm run -s typecheck`
  - `rtk proxy npm run -s lint`
  - `rtk proxy npx vitest run --project unit tests/swap-ekubo.test.ts tests/swap-avnu.test.ts tests/swap-wallet.test.ts tests/tx-builder.test.ts`
  - `rtk proxy npm --prefix examples/mobile run -s lint`
  - `rtk tsc -p examples/mobile/tsconfig.json --noEmit` (still failing due existing mobile `starkzap` export/linking issues; now also includes new AVNU file in that same failure class)
- Notes:
  - Added SDK adapter `AvnuSwapAdapter` and tests under `tests/swap-avnu.test.ts`.
  - Widened shared quote/request contracts (`amountInBase`, optional route metadata, optional `takerAddress`) for provider neutrality.
  - Added mobile AVNU integration (`swaps/avnu.ts`) using AVNU v3 quote/build APIs and registered it with Ekubo under one UI.

# Swap API Ergonomics

## Task
- [x] Redesign provider surface to return normalized swap plans (instead of adapter/request plumbing).
- [x] Add wallet convenience methods for provider flows (`prepareSwap`, `executeSwapPlan`, `swapWith`).
- [x] Add tx builder provider helper (`swapWith`) on top of normalized plan flow.
- [x] Refactor mobile swap flow to use provider-first wallet methods.
- [x] Extend tests for new wallet/tx-builder convenience paths.
- [x] Run targeted verification and document outcomes.

## Acceptance Criteria
- [x] Provider implementations are generic and protocol-agnostic at call site.
- [x] Common usage no longer requires handling adapter internals.
- [x] Existing low-level adapter API remains available.
- [x] Unit tests pass for updated swap/wallet/tx-builder behavior.

## Review
- Status: Complete
- Verification:
  - `rtk proxy npm run -s typecheck`
  - `rtk proxy npm run -s lint`
  - `rtk proxy npx vitest run --project unit`
  - `rtk proxy npx vitest run --project unit tests/swap-wallet.test.ts tests/tx-builder.test.ts tests/swap-ekubo.test.ts tests/swap-avnu.test.ts`
  - `rtk proxy npm --prefix examples/mobile run -s lint`
  - `rtk tsc -p examples/mobile/tsconfig.json --noEmit` (still fails on existing mobile `starkzap` export/linking issues; swap files remain in that same failure class)
- Notes:
  - `SwapProvider.prepareSwap` now returns `PreparedSwapPlan` (`{ plan, quote }`) for a more convenient generic flow.
  - Added `WalletInterface` helpers `populateSwapPlan`, `prepareSwap`, `executeSwapPlan`, `swapWith`.
  - Mobile swap submit now executes through `wallet.prepareSwap(...)` + `wallet.executeSwapPlan(...)`, avoiding direct adapter/request handling.

# AVNU Sepolia Quote Reliability

## Task
- [x] Investigate repeated AVNU Sepolia "quote returned no routes" failures.
- [x] Make AVNU quote/build host selection chain-aware with Sepolia fallback behavior.
- [x] Improve no-route errors with actionable hints (amount/pair/source).
- [x] Fix AVNU slippage conversion from basis points to percentage.
- [x] Run verification for touched swap/wallet paths.

## Acceptance Criteria
- [x] AVNU integration attempts Sepolia-specific host first on Sepolia.
- [x] Quote failures include context and guidance instead of opaque generic errors.
- [x] Slippage passed to AVNU build endpoint is correctly scaled.
- [x] SDK typecheck/lint and targeted unit tests pass.

## Review
- Status: Complete
- Verification:
  - `rtk proxy npm run -s typecheck`
  - `rtk proxy npm run -s lint`
  - `rtk proxy npx vitest run --project unit tests/swap-avnu.test.ts tests/swap-wallet.test.ts tests/tx-builder.test.ts`
  - `rtk proxy npm --prefix examples/mobile run -s lint`
- Notes:
  - Updated AVNU integration host strategy to try `https://sepolia.api.avnu.fi` before `https://starknet.api.avnu.fi` for Sepolia.
  - Error now reports route absence plus concrete suggestions when all AVNU quote attempts fail.
  - Corrected slippage conversion logic in AVNU build request.

# Swap Token Selection Persistence

## Task
- [x] Investigate `To` token reverting to default after manual selection (e.g., ETH -> USDC.e).
- [x] Stabilize token source memoization to avoid per-render array identity churn.
- [x] Update defaulting effect to preserve user-selected tokens unless invalid for current integration/network.
- [x] Verify lint/typecheck for touched files.

## Acceptance Criteria
- [x] Selecting `To` token no longer immediately reverts during normal renders.
- [x] Defaults still apply when token becomes invalid for active integration/network.
- [x] No new lint/type errors introduced.

## Review
- Status: Complete
- Verification:
  - `rtk proxy npm --prefix examples/mobile run -s lint`
  - `rtk proxy npm run -s typecheck`
- Notes:
  - Root cause was an effect that reset token state whenever derived arrays changed.
  - `allTokens/strkToken/wbtcToken` now use `useMemo([chainId])`.
  - Defaulting effect now keeps selected tokens when still available and only falls back when invalid or conflicting.

# Simplify Swap TS Interface

## Task
- [x] Reduce swap provider typing complexity by collapsing to one concrete request/response shape.
- [x] Remove generic provider signatures from wallet + tx builder convenience methods.
- [x] Keep compatibility aliases where reasonable to avoid unnecessary breakage.
- [x] Update mobile integration typings to consume the simplified provider interface.
- [x] Run verification for SDK + mobile lint.

## Acceptance Criteria
- [x] `SwapProvider` is easy to implement with concrete `SwapRequest` and `PreparedSwap` types.
- [x] Wallet methods use straightforward provider signatures (`prepareSwap`, `swapWith`).
- [x] Existing swap tests pass without behavior regressions.
- [x] No new lint/type errors introduced.

## Review
- Status: Complete
- Verification:
  - `rtk proxy npm run -s typecheck`
  - `rtk proxy npm run -s lint`
  - `rtk proxy npx vitest run --project unit tests/swap-wallet.test.ts tests/tx-builder.test.ts tests/swap-ekubo.test.ts tests/swap-avnu.test.ts`
  - `rtk proxy npm --prefix examples/mobile run -s lint`
- Notes:
  - Introduced simplified concrete types in swap interface: `SwapRequest`, `PreparedSwap`, `SwapProvider`.
  - Added backward aliases: `SwapPrepareRequest` and `PreparedSwapPlan`.
  - Removed generic provider parameters from wallet and tx builder helper methods.

# Remove Redundant AVNU Adapter Types

## Task
- [x] Remove legacy AVNU adapter request type (`AvnuSwapRequest`) and adapter class (`AvnuSwapAdapter`).
- [x] Remove AVNU adapter export from swap index surface.
- [x] Delete AVNU adapter unit test and keep provider-based flow as single path.
- [x] Verify SDK/mobile checks after cleanup.

## Acceptance Criteria
- [x] AVNU swap integration is provider-only (no duplicate adapter request path).
- [x] No references to `AvnuSwapAdapter`/`AvnuSwapRequest` remain.
- [x] Typecheck/lint/tests pass for touched areas.

## Review
- Status: Complete
- Verification:
  - `rtk proxy npm run -s typecheck`
  - `rtk proxy npm run -s lint`
  - `rtk proxy npx vitest run --project unit tests/swap-wallet.test.ts tests/tx-builder.test.ts tests/swap-ekubo.test.ts`
  - `rtk proxy npm --prefix examples/mobile run -s lint`
- Notes:
  - Deleted `src/swap/avnu.ts` and `tests/swap-avnu.test.ts`.
  - Removed `export * from "@/swap/avnu";` from `src/swap/index.ts`.

# Simplify SwapAdapter Signature

## Task
- [x] Simplify `SwapAdapter` by removing generic type parameter from public interface.
- [x] Update wallet and tx builder adapter methods to use `request: unknown`.
- [x] Keep typed convenience in Ekubo adapter through overload + runtime request validation.
- [x] Update affected unit tests to match the simplified adapter contract.
- [x] Run verification for SDK + mobile lint.

## Acceptance Criteria
- [x] `SwapAdapter` interface is simpler to read and implement.
- [x] Existing adapter-based behavior remains unchanged.
- [x] Typecheck/lint/tests pass for touched paths.

## Review
- Status: Complete
- Verification:
  - `rtk proxy npm run -s typecheck`
  - `rtk proxy npm run -s lint`
  - `rtk proxy npx vitest run --project unit tests/swap-wallet.test.ts tests/tx-builder.test.ts tests/swap-ekubo.test.ts`
  - `rtk proxy npm --prefix examples/mobile run -s lint`
- Notes:
  - `SwapAdapter<TRequest>` -> `SwapAdapter` with `buildSwap(request: unknown)`.
  - `WalletInterface`/`BaseWallet`/`TxBuilder` adapter methods now use `request: unknown`.
  - `EkuboSwapAdapter` now validates request shape at runtime and keeps typed overload for direct usage.

# Provider `getQuote`/`swap` API

## Task
- [x] Align provider contract to the expected `getQuote` + `swap` shape.
- [x] Update wallet provider flow to use `provider.swap(request)` internally.
- [x] Update mobile swap integrations (Ekubo + AVNU) to implement `getQuote` and `swap`.
- [x] Update/clean affected unit tests and docs.
- [x] Re-run verification for SDK + mobile lint.

## Acceptance Criteria
- [x] `SwapProvider` exposes `getQuote` and `swap` methods.
- [x] Provider implementations in mobile app follow the same contract.
- [x] Typecheck/lint/unit tests pass for touched areas.

## Review
- Status: Complete
- Verification:
  - `rtk proxy npm run -s typecheck`
  - `rtk proxy npm run -s lint`
  - `rtk proxy npx vitest run --project unit tests/swap-wallet.test.ts tests/tx-builder.test.ts tests/swap-ekubo.test.ts`
  - `rtk proxy npx vitest run --project unit`
  - `rtk proxy npm --prefix examples/mobile run -s lint`
- Notes:
  - `SwapProvider` now standardizes on `getQuote(request)` and `swap(request)`.
  - `BaseWallet.prepareSwap` now delegates to `provider.swap(...)`.
  - Updated docs to show provider-first usage (`getQuote`/`swap`) plus wallet execution helper.

# Provider-Only Swap API (No Adapters)

## Task
- [x] Remove adapter/plan/approval swap interfaces from SDK public surface.
- [x] Simplify wallet swap API to provider-only methods.
- [x] Simplify tx builder swap API to provider-only method.
- [x] Update mobile integrations and UI submit flow to provider-only swap execution.
- [x] Update/trim swap tests and docs for the new shape.
- [x] Re-run SDK and mobile verification.

## Acceptance Criteria
- [x] No `SwapAdapter`, `SwapPlan`, or approval-based swap layering remains in active code.
- [x] Core provider contract is `getQuote(request)` + `swap(request)`.
- [x] Wallet and tx builder execute swaps through provider calls only.
- [x] Typecheck/lint/unit tests pass for touched paths.

## Review
- Status: Complete
- Verification:
  - `rtk proxy npm run -s typecheck`
  - `rtk proxy npm run -s lint`
  - `rtk proxy npx vitest run --project unit tests/swap-wallet.test.ts tests/tx-builder.test.ts tests/swap-ekubo.test.ts`
  - `rtk proxy npx vitest run --project unit`
  - `rtk proxy npm --prefix examples/mobile run -s lint`
- Notes:
  - `PreparedSwap` now returns `calls` directly (no nested `plan`).
  - `wallet.swap(provider, request, options?)` is now the main execution helper.
  - `TxBuilder.swap(provider, request)` now queues provider swap calls directly.

# Reintroduce AVNU Provider (SDK)

## Task
- [x] Re-add an SDK AVNU swap integration in `src/swap/avnu.ts` using provider-only API (`getQuote` + `swap`).
- [x] Re-export AVNU swap provider from `src/swap/index.ts`.
- [x] Add unit tests covering quote normalization, swap call building, Sepolia fallback, and no-route/no-call failures.
- [x] Run typecheck/lint/unit verification.

## Acceptance Criteria
- [x] AVNU is available again from SDK exports.
- [x] AVNU integration conforms to `SwapProvider` interface.
- [x] AVNU tests pass with deterministic mocked fetch behavior.
- [x] Project checks remain green.

## Review
- Status: Complete
- Verification:
  - `rtk proxy npm run -s typecheck`
  - `rtk proxy npm run -s lint`
  - `rtk proxy npx vitest run --project unit tests/swap-avnu.test.ts tests/swap-wallet.test.ts tests/tx-builder.test.ts tests/swap-ekubo.test.ts`
  - `rtk proxy npx vitest run --project unit`
- Notes:
  - Added `AvnuSwapProvider` with chain-aware endpoint fallback and actionable no-route errors.
  - Provider returns normalized `{ calls, quote }` payloads in line with simplified swap API.

# Wallet Swap Ergonomics (Default Provider)

## Task
- [x] Add wallet overloads so swap can be called without explicitly passing a provider each time.
- [x] Use a default provider path for `wallet.swap(request, options?)` and `wallet.quoteSwap(request)`.
- [x] Keep explicit provider signatures for advanced usage.
- [x] Add unit tests for default-provider quote/swap calls.
- [x] Run typecheck/lint/unit verification.

## Acceptance Criteria
- [x] `wallet.swap(request, options?)` works.
- [x] `wallet.quoteSwap(request)` works.
- [x] Existing explicit signatures still work (`wallet.swap(provider, request, options?)`).
- [x] Tests and checks pass.

## Review
- Status: Complete
- Verification:
  - `rtk proxy npm run -s typecheck`
  - `rtk proxy npm run -s lint`
  - `rtk proxy npx vitest run --project unit tests/swap-wallet.test.ts tests/tx-builder.test.ts tests/swap-avnu.test.ts tests/swap-ekubo.test.ts`
  - `rtk proxy npx vitest run --project unit`
- Notes:
  - `BaseWallet` now supports provider overloads + default-provider swap path.
  - Default provider is AVNU unless a custom default is injected in wallet subclasses.

# Wallet `getQuote` Convenience

## Task
- [x] Add `wallet.getQuote(...)` convenience overloads matching `wallet.swap(...)` ergonomics.
- [x] Keep `quoteSwap(...)` as backward-compatible alias.
- [x] Add tests for default-provider and alias behaviors.
- [x] Run typecheck/lint/unit verification.

## Acceptance Criteria
- [x] `wallet.getQuote(request)` works with default provider.
- [x] `wallet.getQuote(provider, request)` remains available.
- [x] `wallet.quoteSwap(...)` still works.
- [x] Checks pass.

## Review
- Status: Complete
- Verification:
  - `rtk proxy npm run -s typecheck`
  - `rtk proxy npm run -s lint`
  - `rtk proxy npx vitest run --project unit tests/swap-wallet.test.ts tests/tx-builder.test.ts tests/swap-avnu.test.ts tests/swap-ekubo.test.ts`
  - `rtk proxy npx vitest run --project unit`

# Multiple Swap Providers Per Wallet

## Task
- [x] Add wallet-level swap provider registry for multiple providers on one wallet.
- [x] Add provider-id overloads for `wallet.getQuote(...)`, `wallet.quoteSwap(...)`, and `wallet.swap(...)`.
- [x] Add provider registry helpers (`registerSwapProvider`, `setDefaultSwapProvider`, `getSwapProvider`, `listSwapProviders`).
- [x] Add tx-builder support for provider-id swap calls.
- [x] Extend tests for provider-id + multi-provider default selection.
- [x] Run verification.

## Acceptance Criteria
- [x] A wallet can hold multiple swap providers simultaneously.
- [x] Caller can execute by provider id string without passing provider object each time.
- [x] Request-only swap/quote APIs continue to work via default provider.
- [x] Checks pass.

## Review
- Status: Complete
- Verification:
  - `rtk proxy npm run -s typecheck`
  - `rtk proxy npm run -s lint`
  - `rtk proxy npx vitest run --project unit tests/swap-wallet.test.ts tests/tx-builder.test.ts tests/swap-avnu.test.ts tests/swap-ekubo.test.ts`
  - `rtk proxy npx vitest run --project unit`

# Pass Additional Swap Providers at Connect Time

## Task
- [x] Extend `ConnectWalletOptions` to accept additional swap providers and optional default provider id.
- [x] Thread these options through `sdk.connectWallet(...)` into wallet creation.
- [x] Register passed providers during `Wallet.create(...)` and apply default id if provided.
- [x] Add wallet test proving connect-time provider injection and default-provider usage.
- [x] Run verification.

## Acceptance Criteria
- [x] Additional providers can be supplied when connecting the wallet.
- [x] Connected wallet has provider registry populated from options.
- [x] Optional `defaultSwapProviderId` selects the default provider.
- [x] Checks pass.

## Review
- Status: Complete
- Verification:
  - `rtk proxy npm run -s typecheck`
  - `rtk proxy npm run -s lint`
  - `rtk proxy npx vitest run --project unit tests/wallet.test.ts tests/swap-wallet.test.ts tests/tx-builder.test.ts tests/swap-avnu.test.ts tests/swap-ekubo.test.ts`
  - `rtk proxy npx vitest run --project unit`
