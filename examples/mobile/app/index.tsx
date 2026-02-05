import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { LogsFAB } from "@/components/LogsFAB";
import { NETWORKS, PRESETS, useWalletStore } from "@/stores/wallet";

const CHAIN_OPTIONS = [
  { label: "Sepolia", value: "SN_SEPOLIA" as const },
  { label: "Mainnet", value: "SN_MAIN" as const },
];

export default function LandingScreen() {
  const {
    // Network config
    isConfigured,
    selectedNetworkIndex,
    customRpcUrl,
    customChainId,
    chainId,
    selectNetwork,
    selectCustomNetwork,
    setCustomRpcUrl,
    setCustomChainId,
    confirmNetworkConfig,
    // Wallet
    privateKey,
    selectedPreset,
    wallet,
    isConnecting,
    setPrivateKey,
    setSelectedPreset,
    connect,
  } = useWalletStore();

  // Redirect to tabs if already connected
  if (wallet) {
    return <Redirect href="/(tabs)/balances" />;
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <ThemedView style={styles.header}>
          <ThemedText type="title">Starknet SDK</ThemedText>
          <ThemedText style={styles.subtitle}>Connect Your Wallet</ThemedText>
        </ThemedView>

        {!isConfigured ? (
          // Network Configuration
          <ThemedView style={styles.card}>
            <ThemedText type="subtitle">Select Network</ThemedText>

            <ThemedView style={styles.inputContainer}>
              <ThemedText style={styles.label}>Network Presets</ThemedText>
              <ThemedView style={styles.presetContainer}>
                {NETWORKS.map((network, index) => (
                  <TouchableOpacity
                    key={network.name}
                    style={[
                      styles.presetButton,
                      selectedNetworkIndex === index &&
                        styles.presetButtonActive,
                    ]}
                    onPress={() => selectNetwork(index)}
                  >
                    <ThemedText
                      style={[
                        styles.presetButtonText,
                        selectedNetworkIndex === index &&
                          styles.presetButtonTextActive,
                      ]}
                    >
                      {network.name}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[
                    styles.presetButton,
                    selectedNetworkIndex === null && styles.presetButtonActive,
                  ]}
                  onPress={selectCustomNetwork}
                >
                  <ThemedText
                    style={[
                      styles.presetButtonText,
                      selectedNetworkIndex === null &&
                        styles.presetButtonTextActive,
                    ]}
                  >
                    Custom
                  </ThemedText>
                </TouchableOpacity>
              </ThemedView>
            </ThemedView>

            {selectedNetworkIndex === null && (
              <>
                <ThemedView style={styles.inputContainer}>
                  <ThemedText style={styles.label}>RPC URL</ThemedText>
                  <TextInput
                    style={styles.input}
                    placeholder="https://your-rpc-url.com"
                    placeholderTextColor="#888"
                    value={customRpcUrl}
                    onChangeText={setCustomRpcUrl}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                  />
                </ThemedView>

                <ThemedView style={styles.inputContainer}>
                  <ThemedText style={styles.label}>Chain</ThemedText>
                  <ThemedView style={styles.presetContainer}>
                    {CHAIN_OPTIONS.map((chain) => (
                      <TouchableOpacity
                        key={chain.value}
                        style={[
                          styles.presetButton,
                          customChainId === chain.value &&
                            styles.presetButtonActive,
                        ]}
                        onPress={() => setCustomChainId(chain.value)}
                      >
                        <ThemedText
                          style={[
                            styles.presetButtonText,
                            customChainId === chain.value &&
                              styles.presetButtonTextActive,
                          ]}
                        >
                          {chain.label}
                        </ThemedText>
                      </TouchableOpacity>
                    ))}
                  </ThemedView>
                </ThemedView>
              </>
            )}

            <TouchableOpacity
              style={[styles.button, styles.buttonPrimary]}
              onPress={confirmNetworkConfig}
            >
              <ThemedText style={styles.buttonText}>Continue</ThemedText>
            </TouchableOpacity>
          </ThemedView>
        ) : (
          // Connection Form
          <ThemedView style={styles.card}>
            <ThemedView style={styles.cardHeader}>
              <ThemedText type="subtitle">Connect Wallet</ThemedText>
              <ThemedView style={styles.networkBadge}>
                <ThemedText style={styles.networkBadgeText}>
                  {NETWORKS.find((n) => n.chainId === chainId)?.name ||
                    "Custom"}
                </ThemedText>
              </ThemedView>
            </ThemedView>

            <ThemedView style={styles.inputContainer}>
              <ThemedText style={styles.label}>Private Key</ThemedText>
              <TextInput
                style={styles.input}
                placeholder="Enter your private key"
                placeholderTextColor="#888"
                value={privateKey}
                onChangeText={setPrivateKey}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </ThemedView>

            <ThemedView style={styles.inputContainer}>
              <ThemedText style={styles.label}>Account Type</ThemedText>
              <ThemedView style={styles.presetContainer}>
                {Object.keys(PRESETS).map((preset) => (
                  <TouchableOpacity
                    key={preset}
                    style={[
                      styles.presetButton,
                      selectedPreset === preset && styles.presetButtonActive,
                    ]}
                    onPress={() => setSelectedPreset(preset)}
                  >
                    <ThemedText
                      style={[
                        styles.presetButtonText,
                        selectedPreset === preset &&
                          styles.presetButtonTextActive,
                      ]}
                    >
                      {preset}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </ThemedView>
            </ThemedView>

            <TouchableOpacity
              style={[styles.button, styles.buttonPrimary]}
              onPress={connect}
              disabled={isConnecting}
            >
              {isConnecting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText style={styles.buttonText}>Connect</ThemedText>
              )}
            </TouchableOpacity>
          </ThemedView>
        )}
      </ScrollView>
      <LogsFAB />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 120,
  },
  header: {
    marginBottom: 24,
    alignItems: "center",
  },
  subtitle: {
    opacity: 0.7,
    marginTop: 4,
  },
  card: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    backgroundColor: "rgba(128, 128, 128, 0.1)",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  networkBadge: {
    backgroundColor: "#0a7ea4",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  networkBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  inputContainer: {
    marginTop: 16,
  },
  label: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "rgba(128, 128, 128, 0.3)",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: "#fff",
    backgroundColor: "rgba(0, 0, 0, 0.2)",
  },
  presetContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  presetButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(128, 128, 128, 0.3)",
  },
  presetButtonActive: {
    backgroundColor: "#0a7ea4",
    borderColor: "#0a7ea4",
  },
  presetButtonText: {
    fontSize: 14,
  },
  presetButtonTextActive: {
    color: "#fff",
  },
  button: {
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 16,
  },
  buttonPrimary: {
    backgroundColor: "#0a7ea4",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
