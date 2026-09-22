import { type ReactNode } from "react";
import { View, TextInput, StyleSheet, type TextInputProps } from "react-native";
import { useTheme } from "@/theme";
import { Text } from "./Text";

export function TextField({
  label,
  right,
  style,
  ...props
}: TextInputProps & { label?: string; right?: ReactNode }) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      {label ? <Text variant="label">{label}</Text> : null}
      <View
        style={[
          styles.row,
          { borderColor: colors.border, borderRadius: radius.md },
        ]}
      >
        <TextInput
          placeholderTextColor={colors.textMuted}
          {...props}
          style={[styles.input, { color: colors.text }, style]}
        />
        {right}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    paddingRight: 6,
  },
  input: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
});
