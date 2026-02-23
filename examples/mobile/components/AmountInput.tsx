import {
  StyleSheet,
  View,
  TextInput,
  TouchableOpacity,
  type ViewStyle,
} from "react-native";
import { ThemedText } from "./themed-text";
import type { Token, Amount } from "@starkware-ecosystem/starkzap";

interface AmountInputProps {
  value: string;
  onChangeText: (text: string) => void;
  token: Token;
  balance?: Amount | null;
  label?: string;
  placeholder?: string;
  /** Optional style for the input row (e.g. transparent bg + grey border) */
  inputRowStyle?: ViewStyle;
}

export function AmountInput({
  value,
  onChangeText,
  token,
  balance,
  label = "Amount",
  placeholder = "0.0",
  inputRowStyle,
}: AmountInputProps) {
  const handleMaxPress = () => {
    if (balance) {
      onChangeText(balance.toUnit());
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <ThemedText style={styles.label}>{label}</ThemedText>
        {balance && (
          <ThemedText style={styles.balanceText}>
            Balance: {balance.toFormatted(true)}
          </ThemedText>
        )}
      </View>
      <View style={[styles.inputRow, inputRowStyle]}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#888"
          keyboardType="decimal-pad"
        />
        <View style={styles.tokenBadge}>
          <ThemedText style={styles.tokenSymbol}>{token.symbol}</ThemedText>
        </View>
        {balance && (
          <TouchableOpacity style={styles.maxButton} onPress={handleMaxPress}>
            <ThemedText style={styles.maxButtonText}>MAX</ThemedText>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    opacity: 0.7,
  },
  balanceText: {
    fontSize: 12,
    opacity: 0.5,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    borderColor: "rgba(128, 128, 128, 0.3)",
  },
  input: {
    flex: 1,
    padding: 12,
    fontSize: 18,
    color: "#fff",
  },
  tokenBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(128, 128, 128, 0.2)",
    borderRadius: 6,
    marginRight: 8,
  },
  tokenSymbol: {
    fontSize: 14,
    fontWeight: "600",
  },
  maxButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#0a7ea4",
    borderRadius: 6,
    marginRight: 8,
  },
  maxButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
});
