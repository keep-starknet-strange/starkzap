import { Tabs, Redirect } from "expo-router";
import React from "react";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useWalletStore } from "@/stores/wallet";

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const wallet = useWalletStore((state) => state.wallet);

  // Redirect to landing if not connected
  if (!wallet) {
    return <Redirect href="/" />;
  }

  const colors = Colors[colorScheme ?? "light"];

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
        },
      }}
    >
      <Tabs.Screen
        name="balances"
        options={{
          title: "Balances",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="wallet.bifold.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="transfers"
        options={{
          title: "Transfers",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="arrow.left.arrow.right" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="staking"
        options={{
          title: "Staking",
          tabBarIcon: ({ color }) => (
            <IconSymbol
              size={28}
              name="chart.line.uptrend.xyaxis"
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
