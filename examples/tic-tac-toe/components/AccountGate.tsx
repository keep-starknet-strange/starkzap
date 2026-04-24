import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
} from "react-native";
import { Text, View } from "@/components/Themed";
import { useStarknetConnector } from "@/app/context/StarknetConnector";
import { PaymentModal, usePaymentSession } from "starkzap-native";

export default function AccountGate() {
  const { connectCartridge, connecting, error, account } =
    useStarknetConnector();
  const paymentSession = usePaymentSession({
    session_url: `https://chainrails-sdk-server-nu.vercel.app/session?amount=0.1&destinationChain=BASE&recipient=0xda3ecb2e5362295e2b802669dd47127a61d9ce54&token=USDC`,
  });

  if (account?.address) {
    return null;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.select({ ios: "padding", android: undefined })}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Connect With Cartridge</Text>
        <Text style={styles.subtitle}>
          This app uses StarkZap native Cartridge onboarding.
        </Text>

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        <Pressable
          accessibilityRole="button"
          onPress={connectCartridge}
          disabled={connecting}
          style={({ pressed }) => [
            styles.primaryButton,
            {
              backgroundColor: "#34c759",
              opacity: connecting ? 0.6 : pressed ? 0.8 : 1,
            },
          ]}
        >
          {connecting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryText}>Connect Cartridge</Text>
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={paymentSession.open}
          disabled={connecting}
          style={({ pressed }) => [
            styles.primaryButton,
            {
              backgroundColor: "gray",
              opacity: connecting ? 0.6 : pressed ? 0.8 : 1,
              position: "fixed",
              top: "100%",
              marginInline: "auto",
              width: "100%",
            },
          ]}
        >
          <Text style={styles.primaryText}>Buy me a Coffee</Text>
        </Pressable>
      </View>
      <PaymentModal {...paymentSession} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 520,
    gap: 14,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.8,
    textAlign: "center",
  },
  errorText: {
    fontSize: 13,
    color: "#c0392b",
    textAlign: "center",
  },
  primaryButton: {
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
