# StarkZap Wallet Stats Dashboard

A beautiful, modern dashboard example showcasing the StarkZap SDK capabilities for
Starknet wallet integration.

## Features

### Core Features

- **Multi-Provider Wallet Connection**
  - ✅ Cartridge Controller (embedded wallet) - **Fully Implemented**
  - ⏳ Argent X (browser extension) - **Placeholder** (shows alert directing to web example)
  - ⏳ Braavos (browser extension) - **Placeholder** (shows alert directing to web example)

- **Token Balance Display** - ✅ **Fully Implemented**
  - Real-time balance fetching for all supported ERC20 tokens
  - USD value estimation (mock prices for demo)
  - Auto-refresh capability

- **Staking Positions** - ⏳ **Placeholder**
  - Currently shows empty state
  - Ready for staking position integration via `Staking` class

- **Activity Tracking** - ⏳ **Placeholder**
  - In-memory transaction log (cleared on disconnect)
  - No persistent storage or indexer integration

### Dashboard Stats

- Total portfolio balance
- Staked amount with APY
- Transaction count
- Gas saved through sponsored transactions

## Quick Start

### Prerequisites

- Node.js 18+
- npm or bun

### Installation

```bash
# From the starkzap root directory
npm install

# Or from this example directory
cd examples/wallet-stats
npm install
```

### Development

```bash
npm run dev
```

The dashboard will be available at `http://localhost:5173`

## Architecture

### Tech Stack

- **Vite** - Fast, modern build tool
- **TypeScript** - Type-safe development
- **Vanilla JS/TS** - No framework dependencies
- **StarkZap SDK** - Starknet wallet integration

### File Structure

```
wallet-stats/
├── index.html      # Dashboard HTML with inline CSS
├── main.ts         # Application logic
├── package.json    # Dependencies
├── tsconfig.json   # TypeScript config
└── vite.config.ts  # Build configuration
```

### Key Components

1. **Wallet Connection** - Uses StarkZap's `onboard()` method with different strategies
2. **Balance Fetching** - Uses `wallet.balanceOf(token)` for each supported token
3. **Staking Integration** - Uses `Staking` class for position tracking
4. **Activity Log** - Tracks and displays recent transactions

## StarkZap SDK Usage

### Connecting a Wallet

```typescript
import { StarkZap, OnboardStrategy } from "starkzap";

const sdk = new StarkZap({
  rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_9",
  chainId: ChainId.SEPOLIA,
});

// Connect with Cartridge
const onboard = await sdk.onboard({
  strategy: OnboardStrategy.Cartridge,
  deploy: "never",
  cartridge: { policies: [...] },
});

const wallet = onboard.wallet;
```

### Fetching Balances

```typescript
import { getPresets } from "starkzap";

const tokens = Object.values(getPresets(chainId));

for (const token of tokens) {
  const balance = await wallet.balanceOf(token);
  console.log(`${token.symbol}: ${balance.toFormatted()}`);
}
```

### Working with Staking

```typescript
import { Staking } from "starkzap";

const staking = await Staking.fromStaker(validatorAddress, token, provider);
const position = await staking.getPosition(wallet);

if (position) {
  console.log(`Staked: ${position.staked.toFormatted()}`);
  console.log(`Rewards: ${position.rewards.toFormatted()}`);
}
```

## Customization

### Changing Networks

Update the configuration in `main.ts`:

```typescript
const RPC_URL = "https://starknet-mainnet.public.blastapi.io/rpc/v0_9";
const SDK_CHAIN_ID = ChainId.MAINNET;
```

### Adding Token Prices

In production, integrate a price feed API:

```typescript
async function fetchTokenPrice(symbol: string): Promise<number> {
  const response = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${symbol}&vs_currencies=usd`
  );
  const data = await response.json();
  return data[symbol].usd;
}
```

### Extending with Browser Extensions

For full Argent X and Braavos support, integrate with `window.starknet`:

```typescript
// Check for browser extension
if (window.starknet) {
  const account = await window.starknet.enable();
  // Use account address with StarkZap
}
```

## Production Considerations

1. **Error Handling** - Add comprehensive error boundaries
2. **Caching** - Implement balance caching to reduce RPC calls
3. **Rate Limiting** - Add request throttling for public RPC endpoints
4. **Price Feeds** - Integrate real price oracles for USD calculations
5. **Transaction Indexing** - Use an indexer for complete transaction history

## Related Examples

- `examples/web` - Full SDK playground with all features
- `examples/mobile` - React Native mobile app
- `examples/server` - Server-side integration with Privy

## License

MIT
