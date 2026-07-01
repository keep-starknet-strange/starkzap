import { useCallback, useState } from "react";
import { ActivityIndicator, Alert } from "react-native";
import { router } from "expo-router";
import {
  PrivyProvider,
  usePrivy,
  useLoginWithEmail,
  useLoginWithOAuth,
} from "@privy-io/expo";
import { Screen, Card, Text, Button, TextField } from "@/ui";
import { useTheme } from "@/theme";
import { PRIVY_APP_ID, PRIVY_CLIENT_ID, PRIVY_SERVER_URL } from "@/core/config";
import { useWalletStore } from "@/core/wallet/store";

// NOTE: this module is the ONLY place that statically imports @privy-io/expo.
// It is loaded lazily (see app/privy.tsx) so Expo Go never evaluates the native
// modules it pulls in. Reached only from a dev/custom build.

export default function PrivyScreen() {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      {...(PRIVY_CLIENT_ID ? { clientId: PRIVY_CLIENT_ID } : {})}
    >
      <PrivyLogin />
    </PrivyProvider>
  );
}

function PrivyLogin() {
  const { colors } = useTheme();
  const { isReady, user, getAccessToken, logout } = usePrivy();
  const { sendCode, loginWithCode } = useLoginWithEmail();
  const { login: oauthLogin } = useLoginWithOAuth();
  const connectPrivy = useWalletStore((s) => s.connectPrivy);
  const connecting = useWalletStore((s) => s.connecting);

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      Alert.alert("Privy", String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  // After Privy auth: exchange the access token for a server-managed Starknet
  // wallet, then hand it to the SDK (which signs via the server).
  const connectStarknet = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) throw new Error("No Privy access token");
    const res = await fetch(`${PRIVY_SERVER_URL}/api/wallet/starknet`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Server ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as {
      wallet: { id: string; publicKey: string };
    };
    await connectPrivy({
      walletId: data.wallet.id,
      publicKey: data.wallet.publicKey,
      accessToken: token,
    });
    router.replace("/home");
  }, [getAccessToken, connectPrivy]);

  if (!isReady) {
    return (
      <Screen center>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Text variant="title">Privy</Text>

      <Card>
        {user ? (
          <>
            <Text>Signed in with Privy.</Text>
            <Button
              title="Connect Starknet"
              loading={busy || connecting}
              onPress={() => run(connectStarknet)}
            />
            <Button
              title="Log out"
              variant="ghost"
              onPress={() =>
                run(async () => {
                  await logout();
                  setCodeSent(false);
                })
              }
            />
          </>
        ) : !codeSent ? (
          <>
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="you@example.com"
            />
            <Button
              title="Send code"
              disabled={!email.includes("@")}
              loading={busy}
              onPress={() =>
                run(async () => {
                  await sendCode({ email });
                  setCodeSent(true);
                })
              }
            />
            <Text variant="muted">or</Text>
            <Button
              title="Continue with Google"
              variant="secondary"
              loading={busy}
              onPress={() => run(() => oauthLogin({ provider: "google" }))}
            />
            <Button
              title="Continue with Apple"
              variant="secondary"
              loading={busy}
              onPress={() => run(() => oauthLogin({ provider: "apple" }))}
            />
          </>
        ) : (
          <>
            <Text variant="muted">Enter the code sent to {email}</Text>
            <TextField
              label="Code"
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              placeholder="6-digit code"
            />
            <Button
              title="Verify"
              disabled={otp.length < 4}
              loading={busy}
              onPress={() => run(() => loginWithCode({ code: otp }))}
            />
            <Button
              title="Use a different email"
              variant="ghost"
              onPress={() => {
                setCodeSent(false);
                setOtp("");
              }}
            />
          </>
        )}
      </Card>

      <Button title="← Back" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
