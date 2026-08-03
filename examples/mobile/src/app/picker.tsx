import { useEffect } from "react";
import { View, Pressable, ScrollView } from "react-native";
import { Stack, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, IconSymbol, RemoteImage } from "@/ui";
import { useTheme } from "@/theme";
import { usePickerStore } from "@/core/picker/store";

export default function PickerScreen() {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const config = usePickerStore((s) => s.config);
  const close = usePickerStore((s) => s.close);

  // Clear the config whenever the sheet leaves (select or native dismiss).
  useEffect(() => () => close(), [close]);

  if (!config) return null;

  return (
    <>
      <Stack.Screen options={{ title: config.title ?? "Select" }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.md }}
      >
        {config.options.map((o) => {
          const active = o.value === config.selected;
          return (
            <Pressable
              key={o.value}
              onPress={() => {
                config.onSelect(o.value);
                router.back();
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: spacing.md,
                paddingHorizontal: spacing.lg,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.md,
                  flexShrink: 1,
                }}
              >
                {o.image ? <RemoteImage uri={o.image} size={28} /> : null}
                <Text
                  style={{
                    color: active ? colors.primary : colors.text,
                    fontWeight: active ? "700" : "400",
                  }}
                >
                  {o.label}
                </Text>
              </View>
              {active ? (
                <IconSymbol name="checkmark" size={20} color={colors.primary} />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </>
  );
}
