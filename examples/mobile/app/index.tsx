import { useState, useCallback, useEffect } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Redirect } from "expo-router";
import { usePrivy, useLoginWithEmail, useLoginWithOAuth } from "@privy-io/expo";

import * as Clipboard from "expo-clipboard";
import * as Crypto from "expo-crypto";
import Ionicons from "@expo/vector-icons/Ionicons";
import { showCopiedToast } from "@/components/Toast";
import { ThemedText } from "@/components/themed-text";
import { LogsFAB } from "@/components/LogsFAB";
import {
  NETWORKS,
  PRESETS,
  PRIVY_SERVER_URL,
  useWalletStore,
} from "@/stores/wallet";
import { useThemeColor } from "@/hooks/use-theme-color";

const PRIVY_APP_ID = process.env.EXPO_PUBLIC_PRIVY_APP_ID || "";

type ConnectionMethod = "privatekey" | "privy";

const SLIDE_MS = 280;
const SLIDE_GAP = 32;

function useSlideTransition(step: number, slideSlotWidth?: number) {
  const x = useSharedValue(0);
  const { width } = useWindowDimensions();
  const w = slideSlotWidth ?? width;
  useEffect(() => {
    x.value = withTiming(-step, { duration: SLIDE_MS });
  }, [step, x]);
  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value * w }],
  }));
  return slideStyle;
}

// Step 1: Sign in with (Email, Google, etc. + note) + Private key + Network
function Step1Content({
  selectedNetworkIndex,
  selectNetwork,
  connectionMethod: _connectionMethod,
  setConnectionMethod,
  onNext,
  privyAvailable,
  setShowEmailForm,
}: {
  selectedNetworkIndex: number | null;
  selectNetwork: (index: number) => void;
  connectionMethod: ConnectionMethod;
  setConnectionMethod: (m: ConnectionMethod) => void;
  onNext: () => void;
  privyAvailable: boolean;
  setShowEmailForm?: (v: boolean) => void;
}) {
  const borderColor = useThemeColor({}, "border");
  const primaryColor = useThemeColor({}, "primary");
  const textSecondary = useThemeColor({}, "textSecondary");

  const openPrivyDocs = () => Linking.openURL("https://docs.privy.io/guide/expo/authentication/oauth");

  return (
    <View style={stepStyles.step}>
      <View style={stepStyles.stepTopRow}>
        {privyAvailable ? (
          <ThemedText style={[stepStyles.oauthLabel, { color: textSecondary }]}>
            Sign in with Privy
          </ThemedText>
        ) : (
          <View style={stepStyles.stepTopRowSpacer} />
        )}
      </View>

      <View style={stepStyles.networkRowWrap}>
        <View style={stepStyles.networkTopRight}>
          <View style={[stepStyles.networkRowTiny, stepStyles.networkRowTinySmall, { borderColor }]}>
            {NETWORKS.map((network, index) => (
              <TouchableOpacity
                key={network.name}
                style={[
                  stepStyles.networkPillTiny,
                  stepStyles.networkPillTinySmall,
                  selectedNetworkIndex === index && { backgroundColor: borderColor },
                ]}
                onPress={() => selectNetwork(index)}
                activeOpacity={0.88}
              >
                <ThemedText
                  style={[
                    stepStyles.networkPillTextTiny,
                    stepStyles.networkPillTextTinySmall,
                    { color: selectedNetworkIndex === index ? primaryColor : textSecondary },
                  ]}
                >
                  {network.name}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {privyAvailable && (
        <>
          <TouchableOpacity
            style={[stepStyles.oauthBtn, { borderColor }]}
            onPress={() => {
              setConnectionMethod("privy");
              setShowEmailForm?.(true);
              onNext();
            }}
            activeOpacity={0.88}
          >
            <Ionicons name="mail-outline" size={18} color={primaryColor} style={stepStyles.oauthBtnIcon} />
            <ThemedText style={stepStyles.oauthBtnText}>Email</ThemedText>
          </TouchableOpacity>
          {OAUTH_BUTTONS.map(({ provider, label, icon, iosOnly }) => {
            if (iosOnly && Platform.OS !== "ios") return null;
            return (
              <TouchableOpacity
                key={provider}
                style={[stepStyles.oauthBtn, { borderColor }]}
                onPress={() => {
                  setConnectionMethod("privy");
                  setShowEmailForm?.(false);
                  onNext();
                }}
                activeOpacity={0.88}
              >
                <Ionicons name={icon} size={18} color={primaryColor} style={stepStyles.oauthBtnIcon} />
                <ThemedText style={stepStyles.oauthBtnText}>{label} *</ThemedText>
              </TouchableOpacity>
            );
          })}
        </>
      )}

      <View style={[stepStyles.orRow, privyAvailable && { marginTop: 12 }]}>
        <ThemedText style={[stepStyles.oauthLabel, { color: textSecondary }]}>
          Or{" "}
        </ThemedText>
        <TouchableOpacity onPress={() => { setConnectionMethod("privatekey"); onNext(); }} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
          <ThemedText style={[stepStyles.oauthLabel, { color: textSecondary, textDecorationLine: "underline" }]}>
            Create/Import Account
          </ThemedText>
        </TouchableOpacity>
      </View>

      {privyAvailable && (
        <View style={[stepStyles.oauthDisclaimer, stepStyles.oauthDisclaimerCompact]}>
          <ThemedText style={[stepStyles.oauthDisclaimerText, stepStyles.oauthDisclaimerTextSmall, stepStyles.oauthDisclaimerNoParagraph, { color: textSecondary }]}>
            *Refer to{" "}
            <ThemedText type="link" style={[stepStyles.oauthDisclaimerLink, stepStyles.oauthDisclaimerLinkSmall]} onPress={openPrivyDocs}>
              Privy docs
            </ThemedText>{" "}
            for complete configuration.
          </ThemedText>
        </View>
      )}
    </View>
  );
}

type OAuthProvider = "google" | "apple" | "twitter";

const OAUTH_BUTTONS: {
  provider: OAuthProvider;
  label: string;
  icon: "logo-google" | "logo-apple" | "logo-twitter";
  iosOnly?: boolean;
}[] = [
  { provider: "google", label: "Google", icon: "logo-google" },
  { provider: "apple", label: "Apple", icon: "logo-apple", iosOnly: true },
  { provider: "twitter", label: "X", icon: "logo-twitter" },
];

// Step 2 Privy: OAuth + email → Connect (compact, no scroll)
function Step2Privy({
  email,
  setEmail,
  otp,
  setOtp,
  loginState,
  sendCode,
  loginWithCode,
  oauthLogin,
  oauthState,
  isReady,
  user,
  isLoadingWallet,
  fetchStarknetWallet,
  handlePrivyLogout,
  onBack,
  showEmailForm,
  setShowEmailForm,
}: {
  email: string;
  setEmail: (s: string) => void;
  otp: string;
  setOtp: (s: string) => void;
  loginState: { status: string };
  sendCode: (opts: { email: string }) => void;
  loginWithCode: (opts: { code: string }) => void;
  oauthLogin: (opts: { provider: OAuthProvider }) => Promise<unknown>;
  oauthState: { status: string };
  isReady: boolean;
  user: unknown;
  isLoadingWallet: boolean;
  fetchStarknetWallet: () => void;
  handlePrivyLogout: () => void;
  onBack: () => void;
  showEmailForm: boolean;
  setShowEmailForm: (v: boolean) => void;
}) {
  const borderColor = useThemeColor({}, "border");
  const primaryColor = useThemeColor({}, "primary");
  const textSecondary = useThemeColor({}, "textSecondary");
  const textColor = useThemeColor({}, "text");

  const showEmail =
    loginState.status === "initial" ||
    loginState.status === "error" ||
    loginState.status === "sending-code";
  const showOtp =
    loginState.status === "awaiting-code-input" ||
    loginState.status === "submitting-code";
  const oauthLoading = oauthState.status === "loading";

  const openPrivyDocs = () => Linking.openURL("https://docs.privy.io/guide/expo/authentication/oauth");

  return (
    <View style={stepStyles.step}>
      {!isReady && (
          <ThemedText style={[stepStyles.muted, { color: textSecondary }]}>
            Initializing…
          </ThemedText>
        )}

        {isReady && !user && !showEmailForm && (
          <>
            <ThemedText style={[stepStyles.oauthLabel, { color: textSecondary }]}>
              Sign in with
            </ThemedText>
          {oauthLoading && (
            <ActivityIndicator size="small" color={primaryColor} style={stepStyles.oauthLoader} />
          )}
          <TouchableOpacity
            style={[stepStyles.oauthBtn, { borderColor }]}
            onPress={() => setShowEmailForm(true)}
            disabled={oauthLoading}
            activeOpacity={0.88}
          >
            <Ionicons name="mail-outline" size={18} color={primaryColor} style={stepStyles.oauthBtnIcon} />
            <ThemedText style={stepStyles.oauthBtnText}>Email</ThemedText>
          </TouchableOpacity>
          {OAUTH_BUTTONS.map(({ provider, label, icon, iosOnly }) => {
            if (iosOnly && Platform.OS !== "ios") return null;
            return (
              <TouchableOpacity
                key={provider}
                style={[stepStyles.oauthBtn, { borderColor }]}
                onPress={() => oauthLogin({ provider })}
                disabled={oauthLoading}
                activeOpacity={0.88}
              >
                <Ionicons name={icon} size={18} color={primaryColor} style={stepStyles.oauthBtnIcon} />
                <ThemedText style={stepStyles.oauthBtnText}>{label} *</ThemedText>
              </TouchableOpacity>
            );
          })}
          <View style={stepStyles.oauthDisclaimer}>
            <ThemedText style={[stepStyles.oauthDisclaimerText, { color: textSecondary }]}>
              Not implemented for the demo. Refer to{" "}
            </ThemedText>
            <TouchableOpacity onPress={openPrivyDocs} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
              <ThemedText type="link" style={stepStyles.oauthDisclaimerLink}>
                Privy docs
              </ThemedText>
            </TouchableOpacity>
          </View>
          </>
        )}

        {isReady && !user && showEmailForm && showEmail && (
        <>
          <TextInput
            style={[stepStyles.input, stepStyles.inputSmall, stepStyles.inputFullWidth, { borderColor, color: textColor }]}
            placeholder="Email"
            placeholderTextColor={textSecondary}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          {loginState.status === "error" && (
            <ThemedText style={stepStyles.errorText}>Login failed</ThemedText>
          )}
          <TouchableOpacity
            style={[stepStyles.primaryButton, stepStyles.primaryButtonSmall, stepStyles.primaryButtonFullWidth, { backgroundColor: "#000" }]}
            onPress={() => email.includes("@") && sendCode({ email })}
            disabled={!email.includes("@") || loginState.status === "sending-code"}
            activeOpacity={0.85}
          >
            {loginState.status === "sending-code" ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <ThemedText style={[stepStyles.primaryButtonText, stepStyles.primaryButtonTextSmall]}>
                Send code
              </ThemedText>
            )}
          </TouchableOpacity>
        </>
      )}

      {isReady && !user && showOtp && (
        <>
          <ThemedText style={[stepStyles.muted, { color: textSecondary }]}>
            Code sent to {email}
          </ThemedText>
          <TextInput
            style={[stepStyles.input, { borderColor, color: textColor }]}
            placeholder="6-digit code"
            placeholderTextColor={textSecondary}
            value={otp}
            onChangeText={setOtp}
            keyboardType="number-pad"
            maxLength={6}
          />
          <TouchableOpacity
            style={[stepStyles.primaryButton, stepStyles.primaryButtonFullWidth, { backgroundColor: primaryColor }]}
            onPress={() => otp.length === 6 && loginWithCode({ code: otp })}
            disabled={otp.length !== 6 || loginState.status === "submitting-code"}
            activeOpacity={0.85}
          >
            {loginState.status === "submitting-code" ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <ThemedText style={stepStyles.primaryButtonText}>
                Verify
              </ThemedText>
            )}
          </TouchableOpacity>
        </>
      )}

      {isReady && user && (
        <>
          <View style={stepStyles.privyConnectRow}>
          {isLoadingWallet ? (
            <ActivityIndicator
              color={primaryColor}
              style={{ marginVertical: 12 }}
            />
          ) : (
            <TouchableOpacity
              style={stepStyles.privyConnectButton}
              onPress={fetchStarknetWallet}
              activeOpacity={0.85}
            >
              <ThemedText style={stepStyles.privyConnectButtonText}>
                Connect Starknet
              </ThemedText>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handlePrivyLogout} style={stepStyles.privyLogoutTopRight}>
            <ThemedText type="link">Log out</ThemedText>
          </TouchableOpacity>
          </View>
        </>
        )}

      <TouchableOpacity onPress={onBack} style={stepStyles.backRowBottom}>
        <ThemedText type="link">← Back</ThemedText>
      </TouchableOpacity>
    </View>
  );
}

const ARGENT_PRESET = "Argent";
const OTHER_PRESETS = Object.keys(PRESETS).filter((p) => p !== ARGENT_PRESET);

// Stark curve order N; private key must be in [1, N)
const STARK_CURVE_ORDER =
  3618502788666131213697322783095070105526743751716087489154079457884512865583n;

function randomBytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8n) | BigInt(bytes[i]);
  }
  return value;
}

/** Generate a Starknet-valid private key in [1, N) and return as 64-char hex. */
function generateStarkPrivateKeyHex(bytes: Uint8Array): string {
  const value = randomBytesToBigInt(bytes);
  const key = value % STARK_CURVE_ORDER;
  const validKey = key === 0n ? 1n : key;
  return validKey.toString(16).padStart(64, "0");
}

// Step 2 Private key choice: Import | Create (tap option to move)
function Step2PrivateKeyChoice({
  onBack,
  onImport,
  onKeyGenerated,
}: {
  onBack: () => void;
  onImport: () => void;
  onKeyGenerated?: (key: string, preset: string) => void;
}) {
  const [showCreateCard, setShowCreateCard] = useState(false);
  const [createPreset, setCreatePreset] = useState<string>(ARGENT_PRESET);
  const [showPresetDropdown, setShowPresetDropdown] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const borderColor = useThemeColor({}, "border");
  const primaryColor = useThemeColor({}, "primary");
  const textSecondary = useThemeColor({}, "textSecondary");
  const _cardBg = useThemeColor({}, "card");

  const createAccountTypeOptions = [
    { label: "Ready", value: ARGENT_PRESET },
    ...OTHER_PRESETS.map((p) => ({ label: p, value: p })),
  ];
  const createPresetLabel = createPreset === ARGENT_PRESET ? "Ready" : createPreset;

  const handleGenerateKey = useCallback(async () => {
    if (!onKeyGenerated) return;
    setIsGenerating(true);
    try {
      const bytes = await Crypto.getRandomBytesAsync(32);
      const hex = generateStarkPrivateKeyHex(bytes);
      onKeyGenerated(hex, createPreset);
    } catch {
      Alert.alert("Error", "Failed to generate key. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  }, [onKeyGenerated, createPreset]);

  return (
    <View style={stepStyles.step}>
      <ThemedText style={[stepStyles.oauthLabel, stepStyles.stepLabelLeft, { color: textSecondary }]}>
        Private key
      </ThemedText>
      <TouchableOpacity
        style={[stepStyles.oauthBtn, { borderColor }]}
        onPress={onImport}
        activeOpacity={0.88}
      >
        <Ionicons name="key-outline" size={18} color={primaryColor} style={stepStyles.oauthBtnIcon} />
        <ThemedText style={stepStyles.oauthBtnText}>Import</ThemedText>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          stepStyles.oauthBtn,
          { borderColor },
          showCreateCard && { backgroundColor: "#000", borderColor: "#000" },
        ]}
        onPress={() => setShowCreateCard((v) => !v)}
        activeOpacity={0.88}
      >
        <Ionicons
          name="person-add-outline"
          size={18}
          color={showCreateCard ? "#fff" : primaryColor}
          style={stepStyles.oauthBtnIcon}
        />
        <ThemedText
          style={[stepStyles.oauthBtnText, showCreateCard && { color: "#fff" }]}
        >
          Create
        </ThemedText>
      </TouchableOpacity>

      {showCreateCard && (
        <View style={stepStyles.createCardExpand}>
          <ThemedText style={[stepStyles.sleekLabel, stepStyles.stepLabelLeft, { color: textSecondary }]}>
            Account type
          </ThemedText>
          <View style={stepStyles.createCardRow}>
            <View style={[stepStyles.dropdownInlineContainerSmall, stepStyles.dropdownInlineContainerInRow, { borderColor }]}>
              <TouchableOpacity
                style={[stepStyles.dropdownTrigger, stepStyles.dropdownTriggerInRow, { borderColor: "transparent" }]}
                onPress={() => setShowPresetDropdown((v) => !v)}
                activeOpacity={0.88}
              >
                <ThemedText
                  style={[stepStyles.dropdownTriggerTextSmall, stepStyles.dropdownTriggerLabel, { color: primaryColor }]}
                  numberOfLines={1}
                >
                  {createPresetLabel}
                </ThemedText>
                <View style={stepStyles.dropdownTriggerIcon}>
                  <Ionicons
                    name={showPresetDropdown ? "chevron-up" : "chevron-down"}
                    size={16}
                    color={textSecondary}
                  />
                </View>
              </TouchableOpacity>
              {showPresetDropdown && (
                <View style={[stepStyles.dropdownInlineList, { borderColor }]}>
                  {createAccountTypeOptions.map(({ label, value }) => (
                    <TouchableOpacity
                      key={value}
                      style={[stepStyles.dropdownInlineOption, { borderColor }]}
                      onPress={() => {
                        setCreatePreset(value);
                        setShowPresetDropdown(false);
                      }}
                      activeOpacity={0.88}
                    >
                      <ThemedText
                        style={[
                          stepStyles.dropdownOptionTextSmall,
                          { color: createPreset === value ? primaryColor : textSecondary },
                        ]}
                      >
                        {label}
                      </ThemedText>
                      {createPreset === value && (
                        <Ionicons name="checkmark" size={16} color={primaryColor} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
            <TouchableOpacity
              style={[stepStyles.primaryButton, stepStyles.primaryButtonSmall, stepStyles.primaryButtonInRow, { backgroundColor: "#000" }]}
              onPress={handleGenerateKey}
              disabled={isGenerating}
              activeOpacity={0.85}
            >
              {isGenerating ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <ThemedText style={[stepStyles.primaryButtonText, stepStyles.primaryButtonTextTiny]}>
                  Generate
                </ThemedText>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      <TouchableOpacity onPress={onBack} style={stepStyles.backRowBottom}>
        <ThemedText type="link">← Back</ThemedText>
      </TouchableOpacity>
    </View>
  );
}

// Step 2 Private key: preset + fee + key + Connect
function Step2PrivateKey({
  selectedPreset,
  setSelectedPreset,
  preferSponsored,
  setPreferSponsored,
  paymasterNodeUrl,
  privateKey,
  setPrivateKey,
  connect,
  isConnecting,
  onBack,
}: {
  selectedPreset: string;
  setSelectedPreset: (s: string) => void;
  preferSponsored: boolean;
  setPreferSponsored: (v: boolean) => void;
  paymasterNodeUrl: string | null;
  privateKey: string;
  setPrivateKey: (s: string) => void;
  connect: () => void;
  isConnecting: boolean;
  onBack: () => void;
}) {
  const [showPresetDropdown, setShowPresetDropdown] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const borderColor = useThemeColor({}, "border");
  const primaryColor = useThemeColor({}, "primary");
  const textSecondary = useThemeColor({}, "textSecondary");
  const textColor = useThemeColor({}, "text");
  const _cardBg = useThemeColor({}, "card");

  const accountTypeOptions = [
    { label: "Ready", value: ARGENT_PRESET },
    ...OTHER_PRESETS.map((p) => ({ label: p, value: p })),
  ];
  const selectedLabel = selectedPreset === ARGENT_PRESET ? "Ready" : selectedPreset;

  const handleCopyPrivateKey = useCallback(async () => {
    if (privateKey.trim()) {
      await Clipboard.setStringAsync(privateKey.trim());
      showCopiedToast();
    }
  }, [privateKey]);

  return (
    <View style={stepStyles.step}>
      <ThemedText style={[stepStyles.sleekLabel, stepStyles.stepLabelLeft, { color: textSecondary }]}>
        Private key
      </ThemedText>
      <View style={[stepStyles.privateKeyRow, { borderColor }]}>
        <TextInput
          style={[stepStyles.input, stepStyles.inputSmall, stepStyles.privateKeyInput, { color: textColor }]}
          placeholder="Paste key"
          placeholderTextColor={textSecondary}
          value={privateKey}
          onChangeText={setPrivateKey}
          secureTextEntry={!showPrivateKey}
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={stepStyles.privateKeyIconBtn}
          onPress={() => setShowPrivateKey((v) => !v)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={showPrivateKey ? "eye-off-outline" : "eye-outline"}
            size={22}
            color={primaryColor}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={stepStyles.privateKeyIconBtn}
          onPress={handleCopyPrivateKey}
          disabled={!privateKey.trim()}
          activeOpacity={0.7}
        >
          <Ionicons
            name="copy-outline"
            size={22}
            color={privateKey.trim() ? primaryColor : textSecondary}
          />
        </TouchableOpacity>
      </View>
      <ThemedText style={stepStyles.privateKeyWarning}>
        Save your private key. If you lose it, you will lose access to this account.
      </ThemedText>

      <ThemedText style={[stepStyles.sleekLabel, stepStyles.sleekLabelSpaced, stepStyles.stepLabelLeft, { color: textSecondary }]}>
        Account Type
      </ThemedText>
      <View style={[stepStyles.dropdownInlineContainerSmall, { borderColor }]}>
        <TouchableOpacity
          style={[stepStyles.dropdownTrigger, { borderColor: "transparent" }]}
          onPress={() => setShowPresetDropdown((v) => !v)}
          activeOpacity={0.88}
        >
          <ThemedText style={[stepStyles.dropdownTriggerTextSmall, { color: primaryColor }]}>
            {selectedLabel}
          </ThemedText>
          <View style={stepStyles.dropdownTriggerIcon}>
            <Ionicons
              name={showPresetDropdown ? "chevron-up" : "chevron-down"}
              size={16}
              color={textSecondary}
            />
          </View>
        </TouchableOpacity>
        {showPresetDropdown && (
          <View style={[stepStyles.dropdownInlineList, { borderColor }]}>
            {accountTypeOptions.map(({ label, value }) => (
              <TouchableOpacity
                key={value}
                style={[stepStyles.dropdownInlineOption, { borderColor }]}
                onPress={() => {
                  setSelectedPreset(value);
                  setShowPresetDropdown(false);
                }}
                activeOpacity={0.88}
              >
                <ThemedText
                  style={[
                    stepStyles.dropdownOptionTextSmall,
                    { color: selectedPreset === value ? primaryColor : textSecondary },
                  ]}
                >
                  {label}
                </ThemedText>
                {selectedPreset === value && (
                  <Ionicons name="checkmark" size={16} color={primaryColor} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {paymasterNodeUrl ? (
        <>
          <ThemedText style={[stepStyles.sleekLabel, stepStyles.sleekLabelSpaced, stepStyles.stepLabelLeft, { color: textSecondary }]}>
            Gas Fees Management
          </ThemedText>
          <View style={[stepStyles.networkRowSmall, { borderColor }]}>
            <TouchableOpacity
              style={[
                stepStyles.networkPillSmall,
                preferSponsored && { backgroundColor: borderColor },
              ]}
              onPress={() => setPreferSponsored(true)}
              activeOpacity={0.88}
            >
              <ThemedText
                style={[
                  stepStyles.networkPillTextSmall,
                  { color: preferSponsored ? primaryColor : textSecondary },
                ]}
              >
                Gas free
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                stepStyles.networkPillSmall,
                !preferSponsored && { backgroundColor: borderColor },
              ]}
              onPress={() => setPreferSponsored(false)}
              activeOpacity={0.88}
            >
              <ThemedText
                style={[
                  stepStyles.networkPillTextSmall,
                  { color: !preferSponsored ? primaryColor : textSecondary },
                ]}
              >
                Non-sponsored
              </ThemedText>
            </TouchableOpacity>
          </View>
        </>
      ) : null}

      <TouchableOpacity
        style={[stepStyles.primaryButton, stepStyles.primaryButtonSmall, stepStyles.primaryButtonFullWidth, { backgroundColor: "#000" }]}
        onPress={connect}
        disabled={isConnecting}
        activeOpacity={0.85}
      >
        {isConnecting ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <ThemedText style={[stepStyles.primaryButtonText, stepStyles.primaryButtonTextSmall]}>Connect</ThemedText>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={onBack} style={stepStyles.backRowBottom}>
        <ThemedText type="link">← Back</ThemedText>
      </TouchableOpacity>
    </View>
  );
}

const stepStyles = StyleSheet.create({
  step: {
    width: "100%",
    maxWidth: 340,
    paddingHorizontal: 24,
    paddingTop: 4,
    alignItems: "center",
  },
  createCard: {
    marginTop: 20,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  createCardExpand: {
    marginTop: 10,
    alignSelf: "stretch",
  },
  stepLabelLeft: {
    alignSelf: "flex-start",
  },
  createCardRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 8,
  },
  dropdownInlineContainerInRow: {
    flex: 1,
    marginTop: 0,
  },
  primaryButtonInRow: {
    marginTop: 0,
    minWidth: 82,
    paddingVertical: 8,
  },
  stepFlex: {
    flex: 1,
  },
  stepCentered: {
    flex: 1,
    justifyContent: "center",
  },
  sleekLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  sleekLabelSpaced: {
    marginTop: 20,
  },
  sleekRow: {
    flexDirection: "row",
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
  },
  sleekPill: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  sleekPillText: {
    fontSize: 13,
    fontWeight: "600",
  },
  stepTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginBottom: 0,
  },
  stepTopRowSpacer: {
    flex: 1,
  },
  networkRowWrap: {
    marginBottom: 8,
    alignSelf: "flex-end",
  },
  networkTopRight: {
    alignSelf: "flex-end",
    alignItems: "flex-end",
  },
  networkLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  networkLabelTiny: {
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  networkRowTiny: {
    flexDirection: "row",
    borderRadius: 6,
    borderWidth: 1,
    overflow: "hidden",
  },
  networkRowTinySmall: {
    borderRadius: 4,
  },
  networkPillTiny: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    alignItems: "center",
  },
  networkPillTinySmall: {
    paddingVertical: 1,
    paddingHorizontal: 4,
  },
  networkPillTextTiny: {
    fontSize: 9,
    fontWeight: "600",
  },
  networkPillTextTinySmall: {
    fontSize: 8,
  },
  networkRowSmall: {
    flexDirection: "row",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
    alignSelf: "flex-start",
  },
  presetRowWrap: {
    flexWrap: "wrap",
    padding: 4,
    gap: 6,
  },
  dropdownTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 0,
    borderRadius: 0,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginTop: 0,
    minWidth: 140,
  },
  dropdownTriggerInRow: {
    minWidth: 0,
  },
  dropdownInlineContainerSmall: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: "hidden",
    marginTop: 6,
  },
  dropdownTriggerOauth: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 0,
    borderRadius: 0,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 0,
    minWidth: 140,
  },
  dropdownInlineContainer: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
    marginTop: 8,
  },
  dropdownInlineList: {
    borderTopWidth: 1,
  },
  dropdownInlineOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderTopWidth: 1,
  },
  dropdownTriggerText: {
    fontSize: 14,
    fontWeight: "600",
  },
  dropdownTriggerIcon: {
    marginLeft: 8,
    flexShrink: 0,
  },
  dropdownTriggerTextSmall: {
    fontSize: 11,
    fontWeight: "600",
  },
  dropdownTriggerLabel: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  dropdownOptionTextSmall: {
    fontSize: 11,
    fontWeight: "500",
  },
  dropdownBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  dropdownBox: {
    width: "100%",
    maxWidth: 280,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  dropdownOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  dropdownOptionText: {
    fontSize: 15,
    fontWeight: "500",
  },
  networkPillSmall: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  networkPillTextSmall: {
    fontSize: 11,
    fontWeight: "600",
  },
  signInNextRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "stretch",
    marginTop: 4,
    gap: 12,
  },
  signInBlock: {
    flex: 1,
    minWidth: 0,
    width: "100%",
  },
  signInButtonsWithArrow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
    width: "100%",
    minWidth: 0,
  },
  arrowButtonCenter: {
    justifyContent: "center",
  },
  signInColumn: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  signInButtonStack: {
    gap: 8,
    marginTop: 4,
  },
  signInOptionBtn: {
    alignSelf: "stretch",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  stepTitle: {
    marginBottom: 12,
    letterSpacing: 0.2,
  },
  pillRow: {
    flexDirection: "row",
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  pillRowSmooth: {
    borderRadius: 14,
  },
  pillRowWrap: {
    flexWrap: "wrap",
    gap: 10,
    padding: 5,
  },
  pill: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
  },
  pillSmall: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  pillText: {
    fontSize: 15,
    fontWeight: "600",
  },
  pillTextSmall: {
    fontSize: 13,
    fontWeight: "600",
  },
  pillTextActive: {
    color: "#fff",
  },
  nextButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButton: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 24,
  },
  primaryButtonSmall: {
    paddingVertical: 10,
    marginTop: 16,
  },
  primaryButtonFullWidth: {
    alignSelf: "stretch",
  },
  primaryButtonSmooth: {
    borderRadius: 14,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  primaryButtonTextSmall: {
    fontSize: 13,
  },
  primaryButtonTextTiny: {
    fontSize: 11,
  },
  privyConnectRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    width: "100%",
  },
  privyConnectButton: {
    backgroundColor: "#000",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
  },
  privyLogoutTopRight: {
    marginLeft: 12,
  },
  privyConnectButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  backRow: {
    marginBottom: 20,
  },
  backRowBottom: {
    marginTop: 24,
    alignSelf: "flex-start",
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginTop: 8,
  },
  inputSmall: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
  },
  inputFullWidth: {
    alignSelf: "stretch",
  },
  privateKeyRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 8,
    overflow: "hidden",
  },
  privateKeyInput: {
    flex: 1,
    borderWidth: 0,
    marginTop: 0,
  },
  privateKeyIconBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  privateKeyWarning: {
    color: "#dc2626",
    fontSize: 12,
    marginTop: 8,
    marginBottom: 0,
  },
  label: {
    fontSize: 13,
    marginTop: 16,
    marginBottom: 6,
  },
  labelSmall: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 14,
    marginBottom: 6,
  },
  accountRow: {
    flexDirection: "row",
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
  },
  accountPill: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  accountPillText: {
    fontSize: 13,
    fontWeight: "600",
  },
  otherPresetsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  otherPresetPill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  otherPresetPillText: {
    fontSize: 12,
    fontWeight: "500",
  },
  gasToggleRow: {
    flexDirection: "row",
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
  },
  gasTogglePill: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  gasToggleText: {
    fontSize: 12,
    fontWeight: "600",
  },
  muted: {
    fontSize: 14,
    marginBottom: 12,
  },
  errorText: {
    color: "#dc3545",
    fontSize: 13,
    marginTop: 8,
  },
  orRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
  },
  oauthLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 10,
  },
  oauthLoader: {
    marginBottom: 8,
  },
  oauthBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
    gap: 8,
    alignSelf: "stretch",
  },
  oauthBtnIcon: {
    opacity: 0.9,
  },
  oauthBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  oauthDisclaimer: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    marginTop: 12,
    paddingRight: 8,
  },
  oauthDisclaimerCompact: {
    marginTop: 0,
    paddingVertical: 0,
  },
  oauthDisclaimerNoParagraph: {
    lineHeight: 12,
    marginVertical: 0,
  },
  oauthDisclaimerText: {
    fontSize: 11,
  },
  oauthDisclaimerTextSmall: {
    fontSize: 9,
  },
  oauthDisclaimerLink: {
    fontSize: 11,
  },
  oauthDisclaimerLinkSmall: {
    fontSize: 9,
  },
});

function LandingWithPrivy() {
  const {
    isConfigured,
    selectedNetworkIndex,
    chainId,
    confirmNetworkConfig,
    resetNetworkConfig,
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
    privySelectedPreset: _privySelectedPreset,
    setPrivySelectedPreset: _setPrivySelectedPreset,
    connectWithPrivy,
    disconnect,
    selectNetwork,
  } = useWalletStore();

  const { isReady, user, logout, getAccessToken } = usePrivy();
  const { sendCode, loginWithCode, state: loginState } = useLoginWithEmail();
  const { login: oauthLogin, state: oauthState } = useLoginWithOAuth();

  const [loginStep, setLoginStep] = useState(0);
  const [connectionMethod, setConnectionMethod] =
    useState<ConnectionMethod>("privy");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [isLoadingWallet, setIsLoadingWallet] = useState(false);

  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const horizontalPadding = Math.max(48, insets.left, insets.right);
  const contentWidth = width - 2 * horizontalPadding;
  const slideSlotWidth = contentWidth + SLIDE_GAP;
  const slideStyle = useSlideTransition(loginStep, slideSlotWidth);

  const fetchStarknetWallet = useCallback(async () => {
    if (!user || wallet || !isConfigured || isLoadingWallet) return;
    setIsLoadingWallet(true);
    const emailAccount = (user as { linked_accounts?: { type: string; address?: string }[] })
      ?.linked_accounts?.find((a) => a.type === "email");
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

      const contentType = res.headers.get("content-type");
      if (!res.ok) {
        const errText = await res.text();
        let message = "Failed to get wallet";
        if (contentType?.includes("application/json")) {
          try {
            const err = JSON.parse(errText);
            message = err.details || err.error || message;
          } catch {
            message = errText || message;
          }
        } else if (errText) message = errText;
        throw new Error(message);
      }

      let walletData: { id: string; publicKey: string };
      if (contentType?.includes("application/json")) {
        const data = JSON.parse(await res.text());
        walletData = data.wallet;
      } else {
        throw new Error("Invalid server response");
      }

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

  const handleNext = useCallback(() => {
    if (selectedNetworkIndex === null) return;
    confirmNetworkConfig();
    setLoginStep(1);
  }, [selectedNetworkIndex, confirmNetworkConfig]);

  const slideCount = connectionMethod === "privatekey" ? 3 : 2;
  const handleBack = useCallback(() => setLoginStep((s) => (s > 0 ? s - 1 : 0)), []);
  const handleBackToChoice = useCallback(() => setLoginStep(1), []);
  const _handleChangeNetwork = useCallback(() => {
    resetNetworkConfig();
    setLoginStep(0);
  }, [resetNetworkConfig]);

  const cardBg = useThemeColor({}, "card");
  const networkName =
    NETWORKS.find((n) => n.chainId.toLiteral() === chainId.toLiteral())?.name ??
    "Custom";

  if (wallet) {
    return <Redirect href="/(tabs)/balances" />;
  }

  const slideRowWidth = slideCount * slideSlotWidth;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={[styles.contentCenter, { paddingLeft: horizontalPadding, paddingRight: horizontalPadding }]}>
          <View style={styles.contentBox}>
            <View style={styles.header}>
              <ThemedText type="title">Starknet SDK</ThemedText>
              <ThemedText style={styles.subtitle}>
                {isConfigured ? networkName : "Connect wallet"}
              </ThemedText>
            </View>

            {!isConfigured ? (
              <View style={styles.cardWrapper}>
                <View style={[styles.card, { backgroundColor: cardBg }]}>
                  <Step1Content
                    selectedNetworkIndex={selectedNetworkIndex}
                    selectNetwork={selectNetwork}
                    connectionMethod={connectionMethod}
                    setConnectionMethod={setConnectionMethod}
                    onNext={handleNext}
                    privyAvailable={true}
                    setShowEmailForm={setShowEmailForm}
                  />
                </View>
              </View>
            ) : (
              <View style={styles.slider}>
              <Animated.View style={[styles.slideRow, { width: slideRowWidth }, slideStyle]}>
                <View style={[styles.slidePage, { width: contentWidth, marginRight: SLIDE_GAP }]}>
                  <View style={styles.cardWrapper}>
                    <View style={[styles.card, styles.cardInSlide, { backgroundColor: cardBg }]}>
                      <Step1Content
                        selectedNetworkIndex={selectedNetworkIndex}
                        selectNetwork={selectNetwork}
                        connectionMethod={connectionMethod}
                        setConnectionMethod={setConnectionMethod}
                        onNext={() => setLoginStep(1)}
                        privyAvailable={true}
                        setShowEmailForm={setShowEmailForm}
                      />
                    </View>
                  </View>
                </View>
                <View style={[styles.slidePage, { width: contentWidth, marginRight: SLIDE_GAP }]}>
                  <View style={styles.cardWrapper}>
                    <View style={[styles.card, styles.cardInSlide, { backgroundColor: cardBg }]}>
                    {connectionMethod === "privy" ? (
                      <Step2Privy
                        email={email}
                        setEmail={setEmail}
                        otp={otp}
                        setOtp={setOtp}
                        loginState={loginState}
                        sendCode={sendCode}
                        loginWithCode={loginWithCode}
                        oauthLogin={oauthLogin as (opts: { provider: OAuthProvider }) => Promise<unknown>}
                        oauthState={oauthState}
                        isReady={isReady}
                        user={user}
                        isLoadingWallet={isLoadingWallet}
                        fetchStarknetWallet={fetchStarknetWallet}
                        handlePrivyLogout={handlePrivyLogout}
                        onBack={handleBack}
                        showEmailForm={showEmailForm}
                        setShowEmailForm={setShowEmailForm}
                      />
                    ) : (
                      <Step2PrivateKeyChoice
                        onBack={handleBack}
                        onImport={() => setLoginStep(2)}
                        onKeyGenerated={(key, preset) => {
                          setPrivateKey(key);
                          setSelectedPreset(preset);
                          setLoginStep(2);
                        }}
                      />
                    )}
                    </View>
                  </View>
                </View>
                {slideCount === 3 && (
                  <View style={[styles.slidePage, { width: contentWidth }]}>
                    <View style={styles.cardWrapper}>
                      <View style={[styles.card, styles.cardInSlide, { backgroundColor: cardBg }]}>
                        <Step2PrivateKey
                          selectedPreset={selectedPreset}
                          setSelectedPreset={setSelectedPreset}
                          preferSponsored={preferSponsored}
                          setPreferSponsored={setPreferSponsored}
                          paymasterNodeUrl={paymasterNodeUrl}
                          privateKey={privateKey}
                          setPrivateKey={setPrivateKey}
                          connect={connect}
                          isConnecting={isConnecting}
                          onBack={handleBackToChoice}
                        />
                      </View>
                    </View>
                  </View>
                )}
              </Animated.View>
            </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      <LogsFAB />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentCenter: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "center",
    width: "100%",
    paddingTop: 24,
    paddingBottom: 48,
  },
  contentBox: {
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: 28,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 6,
    opacity: 0.72,
    letterSpacing: 0.3,
  },
  cardWrapper: {
    width: "100%",
    alignItems: "center",
    alignSelf: "center",
    maxWidth: 300,
  },
  card: {
    width: "100%",
    maxWidth: 300,
    borderRadius: 24,
    paddingTop: 36,
    paddingBottom: 28,
    paddingHorizontal: 20,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  cardInSlide: {
    alignSelf: "center",
  },
  slider: {
    flex: 1,
    width: "100%",
    overflow: "visible",
  },
  slideRow: {
    flexDirection: "row",
  },
  slidePage: {
    width: "100%",
    justifyContent: "flex-start",
    alignItems: "center",
    paddingTop: 28,
    paddingBottom: 20,
  },
});

function LandingNoPrivy() {
  const {
    isConfigured,
    selectedNetworkIndex,
    chainId,
    confirmNetworkConfig,
    resetNetworkConfig,
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
    selectNetwork,
  } = useWalletStore();

  const [loginStep, setLoginStep] = useState(0);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const horizontalPadding = Math.max(48, insets.left, insets.right);
  const contentWidth = width - 2 * horizontalPadding;
  const slideSlotWidth = contentWidth + SLIDE_GAP;
  const slideStyle = useSlideTransition(loginStep, slideSlotWidth);

  const handleNext = useCallback(() => {
    if (selectedNetworkIndex === null) return;
    confirmNetworkConfig();
    setLoginStep(1);
  }, [selectedNetworkIndex, confirmNetworkConfig]);

  const handleBack = useCallback(() => setLoginStep((s) => (s > 0 ? s - 1 : 0)), []);
  const handleBackToChoice = useCallback(() => setLoginStep(1), []);
  const _handleChangeNetwork = useCallback(() => {
    resetNetworkConfig();
    setLoginStep(0);
  }, [resetNetworkConfig]);

  const cardBg = useThemeColor({}, "card");
  const networkName =
    NETWORKS.find((n) => n.chainId.toLiteral() === chainId.toLiteral())?.name ??
    "Custom";

  if (wallet) {
    return <Redirect href="/(tabs)/balances" />;
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={[styles.contentCenter, { paddingLeft: horizontalPadding, paddingRight: horizontalPadding }]}>
          <View style={styles.contentBox}>
            <View style={styles.header}>
              <ThemedText type="title">Starknet SDK</ThemedText>
              <ThemedText style={styles.subtitle}>
                {isConfigured ? networkName : "Connect wallet"}
              </ThemedText>
            </View>

            {!isConfigured ? (
              <View style={styles.cardWrapper}>
                <View style={[styles.card, { backgroundColor: cardBg }]}>
                  <Step1Content
                    selectedNetworkIndex={selectedNetworkIndex}
                    selectNetwork={selectNetwork}
                    connectionMethod="privatekey"
                    setConnectionMethod={() => {}}
                    onNext={handleNext}
                    privyAvailable={false}
                  />
                </View>
              </View>
            ) : (
              <View style={styles.slider}>
              <Animated.View style={[styles.slideRow, { width: 3 * slideSlotWidth }, slideStyle]}>
                <View style={[styles.slidePage, { width: contentWidth, marginRight: SLIDE_GAP }]}>
                  <View style={styles.cardWrapper}>
                    <View style={[styles.card, styles.cardInSlide, { backgroundColor: cardBg }]}>
                      <Step1Content
                        selectedNetworkIndex={selectedNetworkIndex}
                        selectNetwork={selectNetwork}
                        connectionMethod="privatekey"
                        setConnectionMethod={() => {}}
                        onNext={() => setLoginStep(1)}
                        privyAvailable={false}
                      />
                    </View>
                  </View>
                </View>
                <View style={[styles.slidePage, { width: contentWidth, marginRight: SLIDE_GAP }]}>
                  <View style={styles.cardWrapper}>
                    <View style={[styles.card, styles.cardInSlide, { backgroundColor: cardBg }]}>
                      <Step2PrivateKeyChoice
                        onBack={handleBack}
                        onImport={() => setLoginStep(2)}
                        onKeyGenerated={(key, preset) => {
                          setPrivateKey(key);
                          setSelectedPreset(preset);
                          setLoginStep(2);
                        }}
                      />
                    </View>
                  </View>
                </View>
                <View style={[styles.slidePage, { width: contentWidth }]}>
                  <View style={styles.cardWrapper}>
                    <View style={[styles.card, styles.cardInSlide, { backgroundColor: cardBg }]}>
                      <Step2PrivateKey
                        selectedPreset={selectedPreset}
                        setSelectedPreset={setSelectedPreset}
                        preferSponsored={preferSponsored}
                        setPreferSponsored={setPreferSponsored}
                        paymasterNodeUrl={paymasterNodeUrl}
                        privateKey={privateKey}
                        setPrivateKey={setPrivateKey}
                        connect={connect}
                        isConnecting={isConnecting}
                        onBack={handleBackToChoice}
                      />
                    </View>
                  </View>
                </View>
              </Animated.View>
            </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      <LogsFAB />
    </SafeAreaView>
  );
}

export default function LandingScreen() {
  if (PRIVY_APP_ID) {
    return <LandingWithPrivy />;
  }
  return <LandingNoPrivy />;
}