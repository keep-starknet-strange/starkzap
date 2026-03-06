# Starkzap Next.js Demo

A minimal, production-ready Next.js demo for Starkzap payment integration powered by Chainrails.

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Environment Variables

Create a `.env.local` file in the root directory:

```
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_CHAINRAILS_API_KEY=your_api_key_here
```

### 3. Run the Demo

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   └── create-session/
│   │       └── route.ts        # Backend endpoint for session creation
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                # Home page with payment trigger
│   ├── page.css                # Styling
│   └── globals.css             # Global styles
├── components/
│   ├── PaymentPage.tsx         # Payment modal wrapper
│   └── PaymentPage.css         # Modal styles
```

## How It Works

1. **Frontend**: User clicks "Open Payment Modal" button
2. **API Route**: `/api/create-session` creates a Chainrails session token using Starkzap SDK
3. **Payment Modal**: Initializes with the session and accepts payment
4. **Callbacks**: Handles success/cancel events

## Configuration

Update these values in `src/app/page.tsx`:

- `destinationChain`: The blockchain to receive payments on (e.g., `PaymentChains.BASE`)
- `token`: The token you want to receive (e.g., `PaymentTokenSymbols.USDC`)
- `recipient`: Your wallet address to receive funds
- `amount`: Fixed amount or 0 for user input

## Building for Production

```bash
npm run build
npm start
```

## Documentation

- [Starkzap SDK Reference](https://docs.starknet.io/build/starkzap)
- [Chainrails SDK Reference](https://docs.chainrails.io/sdk-reference/introduction)
- [Chainrails API Reference](https://docs.chainrails.io/api-reference/introduction)
