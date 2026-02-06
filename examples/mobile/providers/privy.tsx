import { PrivyProvider } from "@privy-io/expo";

const PRIVY_APP_ID = process.env.EXPO_PUBLIC_PRIVY_APP_ID || "";
const PRIVY_CLIENT_ID = process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID || "";

export function PrivyWrapper({ children }: { children: React.ReactNode }) {
  if (!PRIVY_APP_ID) return <>{children}</>;

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      clientId={PRIVY_CLIENT_ID || undefined}
      config={
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { embeddedWallets: { createOnLogin: "users-without-wallets" } } as any
      }
    >
      {children}
    </PrivyProvider>
  );
}
