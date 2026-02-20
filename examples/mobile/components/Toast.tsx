import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Toast, { ToastConfig } from "react-native-toast-message";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TransactionToast } from "./TransactionToast";

export interface TransactionToastData {
  txHash: string;
  title: string;
  subtitle: string;
  explorerUrl?: string;
}

/**
 * Show a transaction toast notification.
 *
 * @param data - Transaction data to display
 * @param pending - Whether the transaction is pending (shows progress bar)
 */
export function showTransactionToast(
  data: TransactionToastData,
  pending: boolean = false
) {
  Toast.show({
    type: "transaction",
    props: {
      ...data,
      pending,
    },
    autoHide: !pending,
    visibilityTime: pending ? undefined : 5000,
    position: "top",
  });
}

/**
 * Update an existing transaction toast (e.g., when transaction completes).
 */
export function updateTransactionToast(
  data: TransactionToastData,
  pending: boolean = false
) {
  // Hide the existing toast and show updated one
  Toast.hide();
  setTimeout(() => {
    showTransactionToast(data, pending);
  }, 100);
}

/**
 * Hide the current toast.
 */
export function hideToast() {
  Toast.hide();
}

/**
 * Show an error toast.
 */
export function showErrorToast(title: string, message: string) {
  Toast.show({
    type: "error",
    text1: title,
    text2: message,
    visibilityTime: 4000,
    position: "top",
  });
}

/**
 * Show a minimal "Address copied" toast (e.g. after copying address to clipboard).
 */
export function showCopiedToast() {
  Toast.show({
    type: "copied",
    visibilityTime: 1500,
    position: "top",
  });
}

const toastConfig: ToastConfig = {
  transaction: ({ props }) => (
    <TransactionToast
      txHash={props.txHash}
      title={props.title}
      subtitle={props.subtitle}
      explorerUrl={props.explorerUrl}
      pending={props.pending}
    />
  ),
  copied: () => (
    <View style={copiedToastStyles.pill}>
      <Text style={copiedToastStyles.text}>Address copied</Text>
    </View>
  ),
};

const copiedToastStyles = StyleSheet.create({
  pill: {
    backgroundColor: "rgba(0,0,0,0.72)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: "center",
  },
  text: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "500",
  },
});

/**
 * Toast container component to be rendered at the app root.
 */
export function AppToast() {
  const insets = useSafeAreaInsets();

  return (
    <Toast
      position="top"
      topOffset={insets.top + 10}
      bottomOffset={insets.bottom + 24}
      config={toastConfig}
    />
  );
}
