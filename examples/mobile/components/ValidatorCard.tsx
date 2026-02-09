import { StyleSheet, View, Image, TouchableOpacity } from "react-native";
import { ThemedText } from "./themed-text";
import type { Validator } from "x";

interface ValidatorCardProps {
  validator: Validator;
  isSelected?: boolean;
  onSelect?: () => void;
}

export function ValidatorCard({
  validator,
  isSelected,
  onSelect,
}: ValidatorCardProps) {
  return (
    <TouchableOpacity
      style={[styles.container, isSelected && styles.containerSelected]}
      onPress={onSelect}
      activeOpacity={0.7}
    >
      <View style={styles.validatorInfo}>
        {validator.logoUrl ? (
          <Image
            source={{ uri: validator.logoUrl.toString() }}
            style={styles.logo}
          />
        ) : (
          <View style={[styles.logo, styles.logoPlaceholder]}>
            <ThemedText style={styles.logoText}>
              {validator.name.charAt(0)}
            </ThemedText>
          </View>
        )}
        <View style={styles.validatorDetails}>
          <ThemedText style={styles.name}>{validator.name}</ThemedText>
          <ThemedText style={styles.address} numberOfLines={1}>
            {validator.stakerAddress.slice(0, 10)}...
            {validator.stakerAddress.slice(-6)}
          </ThemedText>
        </View>
      </View>
      {isSelected && (
        <View style={styles.checkmark}>
          <ThemedText style={styles.checkmarkText}>✓</ThemedText>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    backgroundColor: "rgba(128, 128, 128, 0.1)",
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: "transparent",
  },
  containerSelected: {
    borderColor: "#0a7ea4",
    backgroundColor: "rgba(10, 126, 164, 0.1)",
  },
  validatorInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  logoPlaceholder: {
    backgroundColor: "#0a7ea4",
    justifyContent: "center",
    alignItems: "center",
  },
  logoText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  validatorDetails: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: "600",
  },
  address: {
    fontSize: 11,
    opacity: 0.5,
    fontFamily: "monospace",
    marginTop: 2,
  },
  checkmark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#0a7ea4",
    justifyContent: "center",
    alignItems: "center",
  },
  checkmarkText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
});
