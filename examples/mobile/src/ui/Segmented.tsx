import { View, Pressable, StyleSheet } from "react-native";
import { useTheme } from "@/theme";
import { Text } from "./Text";

export interface SegmentedOption<T extends string> {
  label: string;
  value: T;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={[
        styles.row,
        { borderColor: colors.border, borderRadius: radius.md },
      ]}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[
              styles.pill,
              { borderRadius: radius.sm },
              active && { backgroundColor: colors.primary },
            ]}
          >
            <Text
              style={[
                styles.text,
                { color: active ? colors.primaryText : colors.textMuted },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", borderWidth: 1, padding: 3, gap: 3 },
  pill: { flex: 1, paddingVertical: 8, alignItems: "center" },
  text: { fontSize: 13, fontWeight: "600" },
});
