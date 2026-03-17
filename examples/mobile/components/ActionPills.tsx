import { StyleSheet, TouchableOpacity, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { useThemeColor } from "@/hooks/use-theme-color";

export function ActionPills<T extends string>(props: {
  actions: readonly T[];
  labels?: Record<T, string>;
  selected: T;
  onSelect: (action: T) => void;
}) {
  const borderColor = useThemeColor({}, "border");
  const primaryColor = useThemeColor({}, "primary");
  const backgroundColor = useThemeColor({}, "background");

  return (
    <View style={styles.row}>
      {props.actions.map((action) => {
        const isSelected = props.selected === action;
        const label = props.labels?.[action] ?? capitalize(action);
        return (
          <TouchableOpacity
            key={action}
            style={[
              styles.pill,
              isSelected && styles.pillSelected,
              {
                borderColor,
                backgroundColor: isSelected ? "#000" : backgroundColor,
              },
            ]}
            onPress={() => props.onSelect(action)}
            activeOpacity={0.88}
          >
            <ThemedText
              style={[
                styles.text,
                { color: isSelected ? "#fff" : primaryColor },
              ]}
            >
              {label}
            </ThemedText>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pillSelected: { borderColor: "#000" },
  text: { fontSize: 12, fontWeight: "700" },
});
