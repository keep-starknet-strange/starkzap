import { StarknetWallet } from '@/components/StarknetWallet';

// Force dynamic rendering to avoid build-time Privy initialization
export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Header */}
      <header className="text-center mb-8">
        <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-starknet-primary to-starknet-light bg-clip-text text-transparent">
          Starkzap + Privy
        </h1>
        <p className="text-gray-400">
          Embedded Starknet wallets with social login
        </p>
      </header>

      {/* Main Wallet Component */}
      <StarknetWallet />

      {/* Footer */}
      <footer className="mt-8 text-center text-sm text-gray-500">
        <p>
          Built with{' '}
          <a
            href="https://github.com/keep-starknet-strange/starkzap"
            target="_blank"
            rel="noopener noreferrer"
            className="text-starknet-primary hover:underline"
          >
            Starkzap SDK
          </a>
          {' '}+{' '}
          <a
            href="https://docs.privy.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-starknet-primary hover:underline"
          >
            Privy
          </a>
        </p>
      </footer>
    </div>
  );
}
