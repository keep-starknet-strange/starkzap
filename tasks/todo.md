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
