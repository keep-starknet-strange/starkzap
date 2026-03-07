'use client';

import { PrivyProvider as BasePrivyProvider } from '@privy-io/react-auth';
import { ReactNode } from 'react';

interface PrivyProviderProps {
  children: ReactNode;
}

export function PrivyProvider({ children }: PrivyProviderProps) {
  // Get app ID at runtime, not build time
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  // If no app ID, render children without Privy (for build/preview)
  if (!appId) {
    return (
      <div className="p-4 bg-yellow-900/30 border border-yellow-700 rounded-lg">
        <p className="text-yellow-400">
          Missing NEXT_PUBLIC_PRIVY_APP_ID. Please set up your .env.local file.
        </p>
        {children}
      </div>
    );
  }

  return (
    <BasePrivyProvider
      appId={appId}
      config={{
        // Configure embedded wallets - Starknet wallets are created server-side
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
        },
        // Appearance
        appearance: {
          theme: 'dark',
          accentColor: '#403DED', // Starknet-inspired purple
        },
      }}
    >
      {children}
    </BasePrivyProvider>
  );
}
