# Starkzap + Privy Next.js Example

This example demonstrates how to integrate **Starkzap SDK** with **Privy** for embedded Starknet wallets in a Next.js App Router application.

## Features

- 🔐 **Social Login** - Google, Twitter, Discord, Telegram, Email
- 💳 **Embedded Wallets** - Privy creates and manages Starknet wallets
- ⚡ **Gasless Transactions** - Optional AVNU paymaster integration
- 🔄 **Account Abstraction** - Argent and OpenZeppelin account presets
- 📱 **Modern UX** - Next.js App Router with Tailwind CSS

## Prerequisites

1. **Privy Account** - Sign up at [dashboard.privy.io](https://dashboard.privy.io/)
2. **Privy App ID and Secret** - Get from your Privy dashboard
3. **Node.js 18+** and npm/bun

## Setup

### 1. Install Dependencies

```bash
cd examples/privy-nextjs
npm install
# or
bun install
```

### 2. Configure Environment

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your credentials:

```env
# Required: Get from https://dashboard.privy.io/
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
PRIVY_APP_SECRET=your_privy_app_secret

# Optional: Starknet RPC URL (defaults to Cartridge Sepolia)
NEXT_PUBLIC_RPC_URL=https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_9

# Optional: For sponsored transactions
AVNU_API_KEY=your_avnu_api_key
AVNU_PAYMASTER_URL=https://sepolia.paymaster.avnu.fi
```

### 3. Configure Privy Dashboard

In your Privy dashboard:

1. Go to **Settings > Chains**
2. Enable **Starknet** (Mainnet and/or Sepolia)
3. Go to **Settings > Login Methods**
4. Enable your preferred social logins

### 4. Run the Development Server

```bash
npm run dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## How It Works

### Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Privy Auth    │────▶│  Next.js API     │────▶│  Privy Server   │
│  (Social Login) │     │  (Sign & Create) │     │  (Key Mgmt)     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌──────────────────┐
│  Starkzap SDK   │────▶│   Starknet RPC   │
│ (Account Abstr) │     │   (Transactions) │
└─────────────────┘     └──────────────────┘
```

### Flow

1. **User logs in** via Privy (Google, email, etc.)
2. **Backend creates** an embedded Starknet wallet via Privy API
3. **Starkzap SDK** connects using `OnboardStrategy.Privy`
4. **User signs transactions** via backend signing endpoint
5. **Transactions execute** on Starknet (with optional paymaster)

### Key Files

| File | Purpose |
|------|---------|
| `app/api/wallet/starknet/route.ts` | Create/get embedded Starknet wallet |
| `app/api/wallet/sign/route.ts` | Sign transaction hashes with Privy |
| `components/PrivyProvider.tsx` | Privy React provider config |
| `components/StarknetWallet.tsx` | Main wallet component with starkzap |
| `lib/starkzap.ts` | Starkzap SDK configuration |

## Usage Examples

### Connect Wallet

```typescript
import { usePrivy } from '@privy-io/react-auth';
import { getSDK, OnboardStrategy, ArgentPreset } from 'starkzap';

const { authenticated, getAccessToken } = usePrivy();

async function connectWallet() {
  const token = await getAccessToken();

  // Get wallet from backend
  const response = await fetch('/api/wallet/starknet', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const { wallet } = await response.json();

  // Connect with starkzap
  const sdk = getSDK();
  const onboard = await sdk.onboard({
    strategy: OnboardStrategy.Privy,
    accountPreset: ArgentPreset,
    privy: {
      resolve: async () => ({
        walletId: wallet.walletId,
        publicKey: wallet.publicKey,
        serverUrl: '/api/wallet/sign',
        headers: () => ({ Authorization: `Bearer ${token}` }),
      }),
    },
  });

  return onboard.wallet;
}
```

### Execute Transaction

```typescript
const wallet = await connectWallet();

// Transfer STRK
const tx = await wallet.execute([
  {
    contractAddress: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
    entrypoint: 'transfer',
    calldata: [recipientAddress, amountLow, amountHigh],
  },
]);

await tx.wait();
```

### Gasless Transaction (with Paymaster)

```typescript
// Sponsored transaction - user pays no gas
const tx = await wallet.execute(
  calls,
  { feeMode: 'sponsored' }
);
```

## Production Considerations

### Database

Replace the in-memory `walletStore` with a real database:

```typescript
// Example with PostgreSQL + Prisma
const wallet = await prisma.starknetWallet.upsert({
  where: { userId },
  create: { userId, walletId, publicKey, address },
  update: {},
});
```

### Security

- **Rate limit** the signing endpoint
- **Validate** transaction hashes before signing
- **Log** all signing requests for audit
- **Use HTTPS** in production

### Error Handling

```typescript
try {
  const tx = await wallet.execute(calls);
  await tx.wait();
} catch (error) {
  if (error.message.includes('insufficient funds')) {
    // Handle funding error
  } else if (error.message.includes('not deployed')) {
    // Prompt user to deploy first
  }
}
```

## Troubleshooting

### "Missing authorization token"

- Ensure user is authenticated via Privy
- Check that `getAccessToken()` returns a valid token

### "Account not deployed"

- Fund the wallet address first
- Call `wallet.deploy()` to deploy the account

### "Privy signing failed"

- Verify `PRIVY_APP_SECRET` is correct
- Check Privy dashboard for API status

## Resources

- [Starkzap Documentation](https://github.com/keep-starknet-strange/starkzap)
- [Privy Documentation](https://docs.privy.io/)
- [Starknet Documentation](https://docs.starknet.io/)
- [Next.js Documentation](https://nextjs.org/docs)

## License

MIT
