import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
} from "react-native";
import { Text, View } from "@/components/Themed";
import { useStarknetConnector } from "@/app/context/StarknetConnector";

export default function AccountGate() {
  const { connectCartridge, connecting, error, account } =
    useStarknetConnector();

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
      </View>
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
