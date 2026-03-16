import { useCallback } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import * as Clipboard from "expo-clipboard";

import { ThemedText } from "@/components/themed-text";
import { useThemeColor } from "@/hooks/use-theme-color";
import { cropAddress } from "@/hooks/use-dca-state";

export interface WalletHeaderProps {
  walletAddress: string;
  addLog: (message: string) => void;
}

export function WalletHeader({ walletAddress, addLog }: WalletHeaderProps) {
  const borderColor = useThemeColor({}, "border");
  const textSecondary = useThemeColor({}, "textSecondary");

  const handleCopyAddress = useCallback(async () => {
    await Clipboard.setStringAsync(walletAddress);
    addLog("Wallet address copied");
  }, [addLog, walletAddress]);

  return (
    <View style={styles.addressRow}>
      <ThemedText style={[styles.addressLabel, { color: textSecondary }]}>
        Wallet
      </ThemedText>
      <View style={styles.addressRight}>
        <TouchableOpacity
          style={[styles.addressButton, { backgroundColor: borderColor }]}
          onPress={handleCopyAddress}
          activeOpacity={0.88}
        >
          <ThemedText style={[styles.addressText, { color: textSecondary }]}>
            {cropAddress(walletAddress)}
          </ThemedText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  addressButton: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addressLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  addressRight: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  addressRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  addressText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
