import { View, type ViewProps } from "react-native";
import { useTheme } from "@/theme";

export function Card({ style, ...props }: ViewProps) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      {...props}
      style={[
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: radius.lg,
          padding: spacing.lg,
          gap: spacing.md,
        },
        style,
      ]}
    />
  );
}
