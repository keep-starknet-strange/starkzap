import { StyleSheet, TouchableOpacity, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { useThemeColor } from "@/hooks/use-theme-color";

export interface SponsoredToggleProps {
  useSponsored: boolean;
  setUseSponsored: (value: boolean) => void;
  canUseSponsored: boolean;
  disabled?: boolean;
}

export function SponsoredToggle({
  useSponsored,
  setUseSponsored,
  canUseSponsored,
  disabled = false,
}: SponsoredToggleProps) {
  const textSecondary = useThemeColor({}, "textSecondary");
  const isDisabled = !canUseSponsored || disabled;

  return (
    <>
      <View style={styles.sponsoredRow}>
        <ThemedText style={[styles.fieldLabel, { color: textSecondary }]}>
          Sponsored
        </ThemedText>
        <View
          style={[
            styles.sponsoredSwitch,
            isDisabled && styles.sponsoredSwitchDisabled,
          ]}
          pointerEvents={isDisabled ? "none" : "auto"}
        >
          <TouchableOpacity
            style={[
              styles.sponsoredSegment,
              !useSponsored && styles.sponsoredSegmentSelected,
            ]}
            onPress={() => setUseSponsored(false)}
            disabled={isDisabled}
            activeOpacity={0.88}
          >
            <ThemedText
              style={[
                styles.sponsoredText,
                !useSponsored && styles.sponsoredTextSelected,
              ]}
            >
              Off
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.sponsoredSegment,
              useSponsored && styles.sponsoredSegmentSelected,
            ]}
            onPress={() => setUseSponsored(true)}
            disabled={isDisabled}
            activeOpacity={0.88}
          >
            <ThemedText
              style={[
                styles.sponsoredText,
                useSponsored && styles.sponsoredTextSelected,
              ]}
            >
              On
            </ThemedText>
          </TouchableOpacity>
        </View>
      </View>
      {!canUseSponsored && (
        <ThemedText style={[styles.callsHint, { color: textSecondary }]}>
          Paymaster not configured
        </ThemedText>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  callsHint: {
    fontSize: 11,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  sponsoredRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sponsoredSegment: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  sponsoredSegmentSelected: {
    backgroundColor: "#000",
  },
  sponsoredSwitch: {
    backgroundColor: "#e5e5e5",
    borderRadius: 999,
    flexDirection: "row",
    gap: 2,
    padding: 2,
  },
  sponsoredSwitchDisabled: {
    opacity: 0.5,
  },
  sponsoredText: {
    color: "#111",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  sponsoredTextSelected: {
    color: "#fff",
  },
});
