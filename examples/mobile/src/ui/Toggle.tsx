import { View, Switch, StyleSheet, type SwitchProps } from "react-native";
import { useTheme } from "@/theme";
import { Text } from "./Text";

export function Toggle({
  label,
  ...props
}: SwitchProps & { label: string; value: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Switch
        {...props}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor={colors.primaryText}
        ios_backgroundColor={colors.border}
      />
      <Text>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
});
