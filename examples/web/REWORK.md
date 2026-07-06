# Web example rework

> **Status: done.** All features below are ported to Svelte (`src/features/*`).
> The old `main.ts` monolith, `vesu.ts`, and the giant `index.html` markup are
> deleted. Sponsored (gasless) txs are preserved on transfer/swap/dca/lending.
> Run `npm install` (persists the svelte deps) then `npm run dev`.

## 1. Feature gap vs. `mobile`

Mobile features (each `src/features/<name>/`): balances, transfers, swap, dca,
staking, lending, privacy, yield, bridge.

| Feature           | Mobile                                      | Web today                                  | Gap                                     |
| ----------------- | ------------------------------------------- | ------------------------------------------ | --------------------------------------- |
| Account / connect | ✅ `account.tsx`                            | ✅ Connect + Connected Wallet cards        | parity                                  |
| Balances          | ✅ dedicated screen, per-token cards + icon | ⚠️ inline list in "Connected Wallet"       | **no dedicated screen, no token cards** |
| Transfers         | ✅ batched/stacked (many at once)           | ⚠️ single "Transfer" button in wallet card | **no batching, not a screen**           |
| Swap              | ✅                                          | ✅                                         | parity                                  |
| DCA               | ✅ (segment inside Swap)                    | ✅ (separate card)                         | layout differs                          |
| Staking           | ✅ Delegate + LST panels                    | ❌                                         | **missing entirely**                    |
| Lending (Vesu)    | ✅ Earn + Borrow                            | ✅                                         | parity                                  |
| Privacy (Tongo)   | ✅ provider-abstracted                      | ✅ "Confidential (Tongo)"                  | parity                                  |
| Yield (Troves)    | ✅                                          | ❌                                         | **missing entirely**                    |
| Bridge            | ✅                                          | ✅                                         | parity                                  |

**Missing from web:** dedicated Balances screen, batched Transfers screen,
**Staking (Delegate + LST)**, **Yield (Troves)**.

## 2. Current problems

- `main.ts` = 4560 lines, `index.html` = 1780 lines. One monolith.
- 100% imperative DOM: `getElementById` + manual `render*()` calls hand-sync
  SDK/state → DOM. No reactivity, no store layer (mobile has zustand per feature).
- Heavy UI duplication (buttons, cards, quote rows, token selects) hand-built
  each place.

## 3. Stack: **Svelte + Vite**

`$store` auto-subscription removes the manual store→DOM sync. No zustand — svelte
`writable`/`derived`. The framework-agnostic SDK modules (`bridge/`, `vesu.ts`,
`swaps/`, `dca/`) are **reused as-is** (web already drives Reown AppKit via its
vanilla API, so no React bindings are lost). Web imports from `starkzap` (core).

## 4. Target shape (mirrors mobile)

```
web/src/
  main.ts               mount App.svelte
  App.svelte            tab layout + account entry (top-right)
  lib/
    theme.css           mobile palette as CSS vars (light + dark)
    stores/             wallet, network, tokens, logger  (svelte writables)
    ui/                 Button Card TextField Select Segmented Screen  (.svelte)
  features/<name>/       <Name>Panel.svelte + store.ts
                        balances transfers swap dca staking lending privacy yield bridge
  bridge/ vesu.ts        reused framework-agnostic SDK logic (unchanged)
  swaps/ dca/
```

- Native platform elements where they fit: `<select>` for Select, `<img>` for
  logos (handles SVG), CSS `prefers-color-scheme` for theming.
- Keep the existing `log()` logger mechanism; **no log UI** for now.
