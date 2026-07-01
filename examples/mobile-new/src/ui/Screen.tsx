import { type ReactNode } from "react";
import { ScrollView, View, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/theme";

export function Screen({
  children,
  scroll = false,
  center = false,
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  center?: boolean;
  contentStyle?: ViewStyle;
}) {
  const { colors, spacing } = useTheme();
  const padding: ViewStyle = {
    padding: spacing.lg,
    gap: spacing.lg,
    ...(center && { flexGrow: 1, justifyContent: "center" }),
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {scroll ? (
        <ScrollView contentContainerStyle={[padding, contentStyle]}>
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, padding, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}
