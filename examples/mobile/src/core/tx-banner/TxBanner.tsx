import { useEffect, useState } from "react";
import {
  Animated,
  Pressable,
  View,
  ActivityIndicator,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { Text, IconSymbol } from "@/ui";
import { useTheme } from "@/theme";
import { useTxBannerStore } from "./store";

const AUTO_DISMISS_MS = 5000;

const STATUS_WORD = {
  pending: "pending",
  success: "confirmed",
  failed: "failed",
} as const;

export function TxBanner() {
  const { colors, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const current = useTxBannerStore((s) => s.current);
  const dismiss = useTxBannerStore((s) => s.dismiss);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [y] = useState(() => new Animated.Value(-200));

  useEffect(() => {
    Animated.timing(y, {
      toValue: current ? 0 : -200,
      duration: 220,
      useNativeDriver: true,
    }).start();
    // Auto-dismiss once the transaction settles; pending stays until it does.
    if (current && current.status !== "pending") {
      const t = setTimeout(dismiss, AUTO_DISMISS_MS);
      return () => clearTimeout(t);
    }
  }, [current, dismiss, y]);

  if (!current) return null;

  const tone =
    current.status === "success"
      ? colors.success
      : current.status === "failed"
        ? colors.danger
        : colors.accent;

  const onPress = () => {
    if (current.status === "success" && current.explorerUrl) {
      void Linking.openURL(current.explorerUrl);
    } else if (current.status === "failed" && current.error) {
      void Clipboard.setStringAsync(current.error);
      setCopiedId(current.id);
    }
  };

  const copied = copiedId === current.id;

  const subtitle =
    current.status === "pending"
      ? "Waiting for confirmation…"
      : current.status === "success"
        ? "Tap to view on explorer ↗"
        : copied
          ? "Error copied"
          : "Tap to copy error";

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: insets.top + spacing.sm,
        left: spacing.md,
        right: spacing.md,
        transform: [{ translateY: y }],
      }}
    >
      <Pressable
        onPress={onPress}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
          backgroundColor: colors.card,
          borderRadius: radius.md,
          borderLeftWidth: 4,
          borderLeftColor: tone,
          padding: spacing.md,
          shadowColor: "#000",
          shadowOpacity: 0.15,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: 4,
        }}
      >
        {current.status === "pending" ? (
          <ActivityIndicator color={tone} />
        ) : (
          <IconSymbol
            name={
              current.status === "success" ? "checkmark" : "exclamationmark"
            }
            size={22}
            color={tone}
          />
        )}
        <View style={{ flex: 1 }}>
          <Text variant="body" style={{ fontWeight: "600" }}>
            {current.title} {STATUS_WORD[current.status]}
          </Text>
          <Text variant="muted">{subtitle}</Text>
        </View>
        <Pressable onPress={dismiss} hitSlop={8}>
          <IconSymbol name="xmark" size={18} color={colors.textMuted} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}
