import { useEffect } from "react";
import { View, Pressable, ScrollView, Image } from "react-native";
import { Stack, router } from "expo-router";
import { Text, IconSymbol } from "@/ui";
import { useTheme } from "@/theme";
import { usePickerStore } from "@/core/picker/store";

export default function PickerScreen() {
  const { colors, spacing } = useTheme();
  const config = usePickerStore((s) => s.config);
  const close = usePickerStore((s) => s.close);

  // Clear the config whenever the sheet leaves (select or native dismiss).
  useEffect(() => () => close(), [close]);

  if (!config) return null;

  return (
    <>
      <Stack.Screen options={{ title: config.title ?? "Select" }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic">
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
                {o.image ? (
                  <Image
                    source={{ uri: o.image }}
                    style={{ width: 28, height: 28, borderRadius: 14 }}
                  />
                ) : null}
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
