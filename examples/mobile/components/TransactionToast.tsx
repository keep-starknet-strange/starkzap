import { useEffect, useRef, useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Animated,
  Pressable,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";

export interface TransactionToastProps {
  txHash: string;
  title: string;
  subtitle: string;
  explorerUrl?: string;
  pending?: boolean;
  onPress?: () => void;
}

export function TransactionToast({
  txHash,
  title,
  subtitle,
  explorerUrl,
  pending = false,
  onPress,
}: TransactionToastProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setIsExpanded(false);
  }, [txHash]);

  useEffect(() => {
    if (pending) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(progressAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: false,
          }),
          Animated.timing(progressAnim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: false,
          }),
        ])
      ).start();
    } else {
      progressAnim.setValue(0);
    }
  }, [pending, progressAnim]);

  const handlePress = useCallback(() => {
    setIsExpanded((prev) => !prev);
    onPress?.();
  }, [onPress]);

  const handleCopyTxHash = useCallback(async () => {
    await Clipboard.setStringAsync(txHash);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  }, [txHash]);

  const handleOpenExplorer = useCallback(async () => {
    if (explorerUrl) {
      await WebBrowser.openBrowserAsync(explorerUrl);
    }
  }, [explorerUrl]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  const formattedTxHash = `${txHash.slice(0, 10)}...${txHash.slice(-8)}`;

  return (
    <Pressable style={styles.container} onPress={handlePress}>
      <View
        style={[
          styles.content,
          pending ? styles.pendingContent : styles.successContent,
        ]}
      >
        {/* Main Row */}
        <View style={styles.mainRow}>
          <View style={styles.iconContainer}>
            <Text style={styles.iconText}>{pending ? "⏳" : "✓"}</Text>
          </View>

          <View style={styles.textContainer}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <Text
              style={styles.subtitle}
              numberOfLines={isExpanded ? undefined : 1}
            >
              {subtitle}
            </Text>
          </View>

          <View style={styles.expandButton}>
            <Text
              style={[styles.chevron, isExpanded && styles.chevronExpanded]}
            >
              ›
            </Text>
          </View>
        </View>

        {/* Progress Bar */}
        {pending && (
          <View style={styles.progressBarContainer}>
            <Animated.View
              style={[styles.progressBar, { width: progressWidth }]}
            />
          </View>
        )}

        {/* Expandable Details Section */}
        {isExpanded && (
          <View style={styles.detailsContainer}>
            <View style={styles.detailsDivider} />

            {/* Transaction Hash */}
            <View style={styles.txHashSection}>
              <View style={styles.txHashHeader}>
                <Text style={styles.txHashLabel}>TX HASH</Text>
                <View style={styles.txHashActions}>
                  <TouchableOpacity
                    onPress={handleCopyTxHash}
                    style={styles.actionButton}
                  >
                    <Text style={styles.actionButtonText}>
                      {isCopied ? "✓ Copied" : "Copy"}
                    </Text>
                  </TouchableOpacity>

                  {explorerUrl && (
                    <TouchableOpacity
                      onPress={handleOpenExplorer}
                      style={styles.actionButton}
                    >
                      <Text style={styles.actionButtonText}>View</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              <View style={styles.txHashContent}>
                <Text style={styles.txHashText} selectable>
                  {formattedTxHash}
                </Text>
              </View>
            </View>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "90%",
    maxWidth: 400,
    alignSelf: "center",
  },
  content: {
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    overflow: "hidden",
  },
  pendingContent: {
    backgroundColor: "#0a7ea4",
  },
  successContent: {
    backgroundColor: "#28a745",
  },
  progressBarContainer: {
    height: 3,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    width: "80%",
    alignSelf: "center",
    marginBottom: 8,
  },
  progressBar: {
    height: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.8)",
  },
  mainRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 16,
    gap: 12,
  },
  iconContainer: {
    paddingTop: 2,
  },
  iconText: {
    fontSize: 20,
  },
  textContainer: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  subtitle: {
    fontSize: 14,
    color: "#fff",
    lineHeight: 20,
    opacity: 0.9,
  },
  expandButton: {
    paddingTop: 2,
    paddingLeft: 8,
  },
  chevron: {
    fontSize: 20,
    color: "#fff",
    fontWeight: "600",
  },
  chevronExpanded: {
    transform: [{ rotate: "90deg" }],
  },
  detailsContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  detailsDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    marginBottom: 12,
  },
  txHashSection: {
    gap: 8,
  },
  txHashHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  txHashLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#fff",
    letterSpacing: 0.5,
    opacity: 0.8,
  },
  txHashActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 6,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
  },
  txHashContent: {
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    borderRadius: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  txHashText: {
    fontSize: 12,
    color: "#fff",
    fontFamily: "monospace",
  },
});
