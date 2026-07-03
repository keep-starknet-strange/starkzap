import { type ReactNode } from "react";
import { RefreshControl, ScrollView, View, type ViewStyle } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { useTheme } from "@/theme";

export function Screen({
  children,
  scroll = false,
  center = false,
  contentStyle,
  edges,
  onRefresh,
  refreshing = false,
}: {
  children: ReactNode;
  scroll?: boolean;
  center?: boolean;
  contentStyle?: ViewStyle;
  // Defaults to all edges. Drop "top" on screens that show a native header,
  // which already offsets content below the status bar.
  edges?: readonly Edge[];
  // Pull-to-refresh; only applies when scroll is true. Themed here so the
  // spinner uses the primary color on both iOS (tintColor) and Android (colors).
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const { colors, spacing } = useTheme();
  const padding: ViewStyle = {
    padding: spacing.lg,
    gap: spacing.lg,
    ...(center && { flexGrow: 1, justifyContent: "center" }),
  };

  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: colors.bg }}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[padding, contentStyle]}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, padding, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}
