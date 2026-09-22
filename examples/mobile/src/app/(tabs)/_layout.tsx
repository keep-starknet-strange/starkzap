import { Pressable, View } from "react-native";
import { Tabs, router } from "expo-router";
import { IconSymbol, Text } from "@/ui";
import { useTheme } from "@/theme";
import { NETWORKS } from "@/core/network";
import { useWalletStore } from "@/core/wallet/store";

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

// Current network pill; tapping switches to the other network (and re-logs in).
function NetworkBadge() {
  const { colors } = useTheme();
  const networkIndex = useWalletStore((s) => s.networkIndex);
  const switchNetwork = useWalletStore((s) => s.switchNetwork);
  const net = NETWORKS[networkIndex];
  return (
    <Pressable onPress={switchNetwork} hitSlop={8}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
        }}
      >
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: net.chainId.isMainnet()
              ? colors.success
              : colors.textMuted,
          }}
        />
        <Text style={{ fontSize: 13, fontWeight: "600" }}>{net.name}</Text>
      </View>
    </Pressable>
  );
}

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerTitle: () => <NetworkBadge />,
        headerRight: () => <AccountButton />,
        headerStyle: { backgroundColor: colors.bg },
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
          tabBarLabel: "Balances",
          tabBarIcon: ({ color, size }) => (
            <IconSymbol name="wallet.bifold.fill" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="transfers"
        options={{
          tabBarLabel: "Transfers",
          tabBarIcon: ({ color, size }) => (
            <IconSymbol name="paperplane.fill" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="swap"
        options={{
          tabBarLabel: "Swap",
          tabBarIcon: ({ color, size }) => (
            <IconSymbol
              name="arrow.left.arrow.right"
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="staking"
        options={{
          tabBarLabel: "Staking",
          tabBarIcon: ({ color, size }) => (
            <IconSymbol
              name="chart.line.uptrend.xyaxis"
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="lending"
        options={{
          tabBarLabel: "Lending",
          tabBarIcon: ({ color, size }) => (
            <IconSymbol
              name="building.columns.fill"
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="yield"
        options={{
          tabBarLabel: "Yield",
          tabBarIcon: ({ color, size }) => (
            <IconSymbol name="cube.box.fill" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="privacy"
        options={{
          tabBarLabel: "Privacy",
          tabBarIcon: ({ color, size }) => (
            <IconSymbol name="lock.shield.fill" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="bridge"
        options={{
          tabBarLabel: "Bridge",
          tabBarIcon: ({ color, size }) => (
            <IconSymbol
              name="point.3.connected.trianglepath.dotted"
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
