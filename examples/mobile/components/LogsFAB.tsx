import { StyleSheet, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColor } from "@/hooks/use-theme-color";
import { ThemedText } from "./themed-text";

export function LogsFAB() {
  const primaryColor = useThemeColor({}, "primary");
  const insets = useSafeAreaInsets();
  const rightInset = Math.max(28, insets.right);
  return (
    <TouchableOpacity
      style={[styles.fab, { backgroundColor: primaryColor, right: rightInset }]}
      onPress={() => router.push("/logs")}
      activeOpacity={0.8}
    >
      <ThemedText style={styles.fabText}>Logs</ThemedText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    bottom: 100,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  fabText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});
