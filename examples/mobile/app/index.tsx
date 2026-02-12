import { useState, useCallback } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect } from "expo-router";
import { usePrivy, useLoginWithEmail } from "@privy-io/expo";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { LogsFAB } from "@/components/LogsFAB";
import {
  NETWORKS,
  PRESETS,
  PRIVY_SERVER_URL,
  useWalletStore,
} from "@/stores/wallet";

const CHAIN_OPTIONS = [
  { label: "Sepolia", value: "SN_SEPOLIA" as const },
  { label: "Mainnet", value: "SN_MAIN" as const },
];

const PRIVY_APP_ID = process.env.EXPO_PUBLIC_PRIVY_APP_ID || "";

type ConnectionMethod = "privatekey" | "privy";

interface AccountTypeSelectorProps {
  selectedPreset: string;
  onSelectPreset: (preset: string) => void;
}

function AccountTypeSelector({
  selectedPreset,
  onSelectPreset,
}: AccountTypeSelectorProps) {
  return (
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
            onPress={() => onSelectPreset(preset)}
          >
            <ThemedText
              style={[
                styles.presetButtonText,
                selectedPreset === preset && styles.presetButtonTextActive,
              ]}
            >
              {preset}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </ThemedView>
    </ThemedView>
  );
}

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
    resetNetworkConfig,
    // Wallet
    privateKey,
    selectedPreset,
    preferSponsored,
    paymasterNodeUrl,
    wallet,
    isConnecting,
    setPrivateKey,
    setSelectedPreset,
    setPreferSponsored,
    connect,
    // Privy
    privySelectedPreset,
    setPrivySelectedPreset,
    connectWithPrivy,
    disconnect,
  } = useWalletStore();

  const { isReady, user, logout, getAccessToken } = usePrivy();
  const { sendCode, loginWithCode, state: loginState } = useLoginWithEmail();

  const [connectionMethod, setConnectionMethod] =
    useState<ConnectionMethod>("privatekey");
  const [showPrivyForm, setShowPrivyForm] = useState(false);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoadingWallet, setIsLoadingWallet] = useState(false);

  const activePreset =
    connectionMethod === "privatekey" ? selectedPreset : privySelectedPreset;
  const setActivePreset =
    connectionMethod === "privatekey"
      ? setSelectedPreset
      : setPrivySelectedPreset;

  const fetchStarknetWallet = useCallback(async () => {
    if (!user || wallet || !isConfigured || isLoadingWallet) return;
    setIsLoadingWallet(true);
    const emailAccount = user.linked_accounts?.find(
      (a: { type: string }) => a.type === "email"
    ) as { address?: string } | undefined;
    const userEmail = emailAccount?.address || "";

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error("Failed to get Privy access token");

      const res = await fetch(`${PRIVY_SERVER_URL}/api/wallet/starknet`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.details || err.error || "Failed to get wallet");
      }

      const { wallet: walletData } = await res.json();
      await connectWithPrivy(
        walletData.id,
        walletData.publicKey,
        userEmail,
        accessToken
      );
    } catch (err) {
      Alert.alert("Error", String(err));
    } finally {
      setIsLoadingWallet(false);
    }
  }, [
    user,
    wallet,
    isConfigured,
    isLoadingWallet,
    getAccessToken,
    connectWithPrivy,
  ]);

  const handlePrivyLogout = useCallback(async () => {
    await logout();
    disconnect();
    setEmail("");
    setOtp("");
  }, [logout, disconnect]);

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
                  {NETWORKS.find(
                    (n) => n.chainId.toLiteral() === chainId.toLiteral()
                  )?.name || "Custom"}
                </ThemedText>
              </ThemedView>
            </ThemedView>

            {PRIVY_APP_ID ? (
              <ThemedView style={styles.inputContainer}>
                <ThemedText style={styles.label}>Connection Method</ThemedText>
                <ThemedView style={styles.presetContainer}>
                  <TouchableOpacity
                    style={[
                      styles.presetButton,
                      connectionMethod === "privatekey" &&
                        styles.presetButtonActive,
                    ]}
                    onPress={() => setConnectionMethod("privatekey")}
                  >
                    <ThemedText
                      style={[
                        styles.presetButtonText,
                        connectionMethod === "privatekey" &&
                          styles.presetButtonTextActive,
                      ]}
                    >
                      Private Key
                    </ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.presetButton,
                      connectionMethod === "privy" && styles.presetButtonActive,
                    ]}
                    onPress={() => setConnectionMethod("privy")}
                  >
                    <ThemedText
                      style={[
                        styles.presetButtonText,
                        connectionMethod === "privy" &&
                          styles.presetButtonTextActive,
                      ]}
                    >
                      Privy
                    </ThemedText>
                  </TouchableOpacity>
                </ThemedView>
              </ThemedView>
            ) : null}

            <AccountTypeSelector
              selectedPreset={activePreset}
              onSelectPreset={setActivePreset}
            />

            <ThemedView style={styles.inputContainer}>
              <ThemedText style={styles.label}>Default Fee Mode</ThemedText>
              <TouchableOpacity
                style={[
                  styles.toggleButton,
                  preferSponsored && styles.toggleButtonActive,
                  !paymasterNodeUrl && styles.toggleButtonDisabled,
                ]}
                onPress={() => setPreferSponsored(!preferSponsored)}
                disabled={!paymasterNodeUrl}
              >
                <ThemedText
                  style={[
                    styles.toggleButtonText,
                    preferSponsored && styles.toggleButtonTextActive,
                  ]}
                >
                  {preferSponsored
                    ? "Sponsored (default)"
                    : "User Pays (default)"}
                </ThemedText>
              </TouchableOpacity>
              {!paymasterNodeUrl && (
                <ThemedText style={styles.hintText}>
                  Paymaster not configured for this network.
                </ThemedText>
              )}
            </ThemedView>

            {connectionMethod === "privatekey" ? (
              <>
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
              </>
            ) : (
              <>
                {!isReady && (
                  <ThemedText style={styles.infoText}>
                    Initializing Privy...
                  </ThemedText>
                )}

                {isReady && !user && (
                  <TouchableOpacity
                    style={[styles.button, styles.buttonPrivy]}
                    onPress={() => setShowPrivyForm(!showPrivyForm)}
                    disabled={isConnecting || isLoadingWallet}
                  >
                    <ThemedText style={styles.buttonText}>
                      {showPrivyForm ? "Hide Privy Login" : "Login with Privy"}
                    </ThemedText>
                  </TouchableOpacity>
                )}

                {isReady && user && (
                  <ThemedView style={styles.otpInfo}>
                    <ThemedText style={styles.label}>
                      {isLoadingWallet
                        ? "Connecting wallet..."
                        : "Logged in! Tap below to connect wallet."}
                    </ThemedText>
                    {isLoadingWallet ? (
                      <ActivityIndicator
                        color="#8b5cf6"
                        style={{ marginTop: 8 }}
                      />
                    ) : (
                      <TouchableOpacity
                        style={[
                          styles.button,
                          styles.buttonPrimary,
                          { marginTop: 12 },
                        ]}
                        onPress={fetchStarknetWallet}
                      >
                        <ThemedText style={styles.buttonText}>
                          Connect Starknet Wallet
                        </ThemedText>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[
                        styles.button,
                        styles.buttonSecondary,
                        { marginTop: 8 },
                      ]}
                      onPress={handlePrivyLogout}
                    >
                      <ThemedText style={styles.buttonTextSecondary}>
                        Logout
                      </ThemedText>
                    </TouchableOpacity>
                  </ThemedView>
                )}

                {showPrivyForm && !user && (
                  <>
                    {(loginState.status === "initial" ||
                      loginState.status === "error" ||
                      loginState.status === "sending-code") && (
                      <>
                        <ThemedView style={styles.inputContainer}>
                          <ThemedText style={styles.label}>Email</ThemedText>
                          <TextInput
                            style={styles.input}
                            placeholder="user@example.com"
                            placeholderTextColor="#888"
                            value={email}
                            onChangeText={setEmail}
                            autoCapitalize="none"
                            autoCorrect={false}
                            keyboardType="email-address"
                          />
                        </ThemedView>

                        {loginState.status === "error" && (
                          <ThemedText style={styles.errorText}>
                            Login failed
                          </ThemedText>
                        )}

                        <TouchableOpacity
                          style={[styles.button, styles.buttonPrimary]}
                          onPress={() =>
                            email.includes("@") && sendCode({ email })
                          }
                          disabled={
                            !email.includes("@") ||
                            loginState.status === "sending-code"
                          }
                        >
                          {loginState.status === "sending-code" ? (
                            <ActivityIndicator color="#fff" />
                          ) : (
                            <ThemedText style={styles.buttonText}>
                              Send Verification Code
                            </ThemedText>
                          )}
                        </TouchableOpacity>
                      </>
                    )}

                    {(loginState.status === "awaiting-code-input" ||
                      loginState.status === "submitting-code") && (
                      <>
                        <ThemedView style={styles.otpInfo}>
                          <ThemedText style={styles.label}>
                            Verification code sent to:
                          </ThemedText>
                          <ThemedText style={styles.emailText}>
                            {email}
                          </ThemedText>
                        </ThemedView>

                        <ThemedView style={styles.inputContainer}>
                          <ThemedText style={styles.label}>
                            Enter Code
                          </ThemedText>
                          <TextInput
                            style={styles.input}
                            placeholder="Enter 6-digit code"
                            placeholderTextColor="#888"
                            value={otp}
                            onChangeText={setOtp}
                            autoCapitalize="none"
                            autoCorrect={false}
                            keyboardType="number-pad"
                            maxLength={6}
                          />
                        </ThemedView>

                        <TouchableOpacity
                          style={[styles.button, styles.buttonPrimary]}
                          onPress={() =>
                            otp.length === 6 && loginWithCode({ code: otp })
                          }
                          disabled={
                            otp.length !== 6 ||
                            loginState.status === "submitting-code"
                          }
                        >
                          {loginState.status === "submitting-code" ? (
                            <ActivityIndicator color="#fff" />
                          ) : (
                            <ThemedText style={styles.buttonText}>
                              Verify & Connect
                            </ThemedText>
                          )}
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.button,
                            styles.buttonSecondary,
                            { marginTop: 8 },
                          ]}
                          onPress={() => setOtp("")}
                        >
                          <ThemedText style={styles.buttonTextSecondary}>
                            Cancel
                          </ThemedText>
                        </TouchableOpacity>
                      </>
                    )}
                  </>
                )}
              </>
            )}

            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={resetNetworkConfig}
            >
              <ThemedText style={styles.buttonTextSecondary}>
                Change Network
              </ThemedText>
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
  buttonSecondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#0a7ea4",
  },
  buttonPrivy: {
    backgroundColor: "#8b5cf6",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonTextSecondary: {
    color: "#0a7ea4",
    fontSize: 16,
    fontWeight: "600",
  },
  toggleButton: {
    borderWidth: 1,
    borderColor: "rgba(128, 128, 128, 0.3)",
    borderRadius: 8,
    padding: 12,
    backgroundColor: "rgba(0, 0, 0, 0.2)",
  },
  toggleButtonActive: {
    borderColor: "#0a7ea4",
    backgroundColor: "rgba(10, 126, 164, 0.2)",
  },
  toggleButtonDisabled: {
    opacity: 0.5,
  },
  toggleButtonText: {
    fontSize: 14,
  },
  toggleButtonTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  hintText: {
    marginTop: 6,
    fontSize: 12,
    opacity: 0.6,
  },
  infoText: {
    fontSize: 12,
    color: "#888",
    marginTop: 12,
  },
  otpInfo: {
    marginTop: 16,
    padding: 12,
    backgroundColor: "rgba(139, 92, 246, 0.1)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(139, 92, 246, 0.3)",
  },
  emailText: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 4,
  },
  errorText: {
    color: "#dc3545",
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },
});
