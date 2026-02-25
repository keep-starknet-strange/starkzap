# Lessons

- When implementing end-user swap flows, never expose raw JSON call inputs in the primary UX.
- For Ekubo mobile integration, default to token-in/token-out/amount only, then fetch quote + build calls automatically at submit time.
- For protocol contract presets, verify addresses against live chain RPC (`starknet_getClassHashAt`) instead of trusting stale constants.
- On testnets, validate default token pair liquidity with the quote API and choose defaults that route reliably.
- When a user asks for an "interface," confirm and prioritize a reusable TypeScript contract first (SDK/API surface), then treat UI changes as secondary.
- For multi-provider swaps, keep base interfaces provider-neutral and move protocol-specific fields to provider request/quote generics.
- If the API feels cumbersome, add high-level convenience methods that hide low-level adapter plumbing while keeping low-level hooks for advanced flows.
