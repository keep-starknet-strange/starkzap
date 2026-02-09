import { StyleSheet, ScrollView, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useWalletStore } from "@/stores/wallet";

export default function LogsScreen() {
  const { logs, clearLogs } = useWalletStore();

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <View style={styles.header}>
        <ThemedText type="title">Logs</ThemedText>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => router.back()}
        >
          <ThemedText style={styles.closeButtonText}>Close</ThemedText>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
      >
        {logs.length === 0 ? (
          <ThemedView style={styles.emptyState}>
            <ThemedText style={styles.emptyText}>No logs yet</ThemedText>
          </ThemedView>
        ) : (
          <ThemedView style={styles.logContainer}>
            {logs.map((log, index) => (
              <ThemedText key={index} style={styles.logEntry}>
                {log}
              </ThemedText>
            ))}
          </ThemedView>
        )}
      </ScrollView>

      {logs.length > 0 && (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.clearButton} onPress={clearLogs}>
            <ThemedText style={styles.clearButtonText}>Clear Logs</ThemedText>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#151718",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128, 128, 128, 0.2)",
  },
  closeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#0a7ea4",
    borderRadius: 8,
  },
  closeButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    opacity: 0.5,
    fontSize: 16,
  },
  logContainer: {
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    borderRadius: 8,
    padding: 12,
  },
  logEntry: {
    fontSize: 12,
    fontFamily: "monospace",
    opacity: 0.9,
    marginBottom: 6,
    lineHeight: 18,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(128, 128, 128, 0.2)",
  },
  clearButton: {
    backgroundColor: "#dc3545",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  clearButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
