import { Text as RNText, type TextProps, StyleSheet } from "react-native";
import { useTheme } from "@/theme";

type Variant = "title" | "subtitle" | "body" | "label" | "muted";

export function Text({
  variant = "body",
  style,
  ...props
}: TextProps & { variant?: Variant }) {
  const { colors } = useTheme();
  const muted = variant === "muted" || variant === "label";
  return (
    <RNText
      {...props}
      style={[
        styles[variant],
        { color: muted ? colors.textMuted : colors.text },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: "700", letterSpacing: -0.3 },
  subtitle: { fontSize: 16, fontWeight: "600" },
  body: { fontSize: 15 },
  label: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  muted: { fontSize: 13 },
});
