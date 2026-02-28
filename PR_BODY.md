## Summary

Add a new Bridge module to Starkzap SDK for bridging tokens across chains.

## Changes

- **New `src/bridge/` module** with:
  - `BridgeProvider` interface for multi-protocol support
  - `StarkgateBridgeProvider` - official Starkgate bridge (ETH, STRK)
  - `OrbiterBridgeProvider` - cross-chain bridge
  - `BridgeQuote`, `BridgeRequest`, `PreparedBridge` types
  - Utility functions for request validation

- **Wallet integration**:
  - `wallet.bridge()` - execute bridge transactions
  - `wallet.getBridgeQuote()` - get quote before bridging
  - `wallet.registerBridgeProvider()` - add custom providers

- **New tests** in `tests/bridge.test.ts` (15 tests)

## Features

| Feature                 | Status         |
| ----------------------- | -------------- |
| L2→L2 (within Starknet) | ✅ Supported   |
| L2→L1 (withdrawal)      | ✅ Supported   |
| L1→L2 (deposit)         | ⚠️ Via relayer |
| Quote estimation        | ✅             |
| Fee estimation          | ✅             |

## Usage

```typescript
import { starkgateBridge } from "starkzap/bridge";

const quote = await starkgateBridge.getQuote({
  token: ethToken,
  amount: Amount.parse("0.1", ethToken),
  recipient: "0x...",
});

const tx = await wallet.bridge({
  token: ethToken,
  amount: Amount.parse("0.1", ethToken),
  recipient: "0x...",
});
```

## Checklist

- [x] TypeScript compiles
- [x] All tests pass (383 total)
- [x] Lint passes
- [x] Prettier formatting
- [x] Added tests for new functionality
