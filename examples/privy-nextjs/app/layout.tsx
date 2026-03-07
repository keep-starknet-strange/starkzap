import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { PrivyProvider } from '@/components/PrivyProvider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Starknet + Privy | Starkzap Example',
  description: 'Embedded Starknet wallet using Privy and Starkzap SDK',
};

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <PrivyProvider>
          <main className="min-h-screen flex flex-col items-center justify-center p-4">
            {children}
          </main>
        </PrivyProvider>
      </body>
    </html>
  );
}
