import { Pressable } from "react-native";
import { Tabs, router } from "expo-router";
import { IconSymbol } from "@/ui";
import { useTheme } from "@/theme";

// Account icon in the header; tapping opens the account page.
function AccountButton() {
  const { colors, spacing } = useTheme();
  return (
    <Pressable
      onPress={() => router.push("/account")}
      hitSlop={8}
      style={{ marginRight: spacing.md }}
    >
      <IconSymbol name="person.crop.circle" size={28} color={colors.text} />
    </Pressable>
  );
}

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerRight: () => <AccountButton />,
        headerStyle: { backgroundColor: colors.bg },
        title: "Starkzap",
        headerTintColor: colors.text,
        tabBarActiveTintColor: colors.primary,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
        },
      }}
    >
      <Tabs.Screen
        name="balances"
        options={{
          tabBarIcon: ({ color, size }) => (
            <IconSymbol name="wallet.bifold.fill" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
