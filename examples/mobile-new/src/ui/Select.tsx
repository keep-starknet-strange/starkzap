import { Pressable } from "react-native";
import { router } from "expo-router";
import { useTheme } from "@/theme";
import { Text } from "./Text";
import { IconSymbol } from "./icon-symbol";
import { usePickerStore } from "@/core/picker/store";

export interface SelectOption<T extends string> {
  label: string;
  value: T;
}

// A button showing the current selection; tapping opens the picker sheet route.
export function Select<T extends string>({
  options,
  value,
  onChange,
  title,
}: {
  options: SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  title?: string;
}) {
  const { colors, radius, spacing } = useTheme();
  const openPicker = usePickerStore((s) => s.open);
  const selected = options.find((o) => o.value === value);

  return (
    <Pressable
      onPress={() => {
        openPicker({
          title,
          options,
          selected: value,
          onSelect: (v) => onChange(v as T),
        });
        router.push("/picker");
      }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        backgroundColor: colors.card,
        paddingHorizontal: spacing.md,
        minHeight: 48,
      }}
    >
      <Text variant="body">{selected?.label ?? "Select"}</Text>
      <IconSymbol name="chevron.down" size={20} color={colors.textMuted} />
    </Pressable>
  );
}
