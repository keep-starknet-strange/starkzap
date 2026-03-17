import { useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";

import { ThemedText } from "@/components/themed-text";
import { useThemeColor } from "@/hooks/use-theme-color";

export interface DropdownOption {
  key: string;
  label: string;
  description?: string;
}

export function DropdownField(props: {
  label: string;
  placeholder: string;
  valueLabel: string | null;
  valueDescription?: string;
  options: DropdownOption[];
  onSelect: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const borderColor = useThemeColor({}, "border");
  const primaryColor = useThemeColor({}, "primary");
  const textSecondary = useThemeColor({}, "textSecondary");
  const cardBg = useThemeColor({}, "card");
  const backgroundColor = useThemeColor({}, "background");
  const hasOptions = props.options.length > 0;

  return (
    <>
      <View style={styles.fieldSection}>
        <ThemedText style={[styles.label, { color: textSecondary }]}>
          {props.label}
        </ThemedText>
        <TouchableOpacity
          style={[
            styles.button,
            {
              borderColor,
              backgroundColor: hasOptions ? backgroundColor : cardBg,
            },
            !hasOptions && styles.buttonDisabled,
          ]}
          onPress={() => setOpen(true)}
          disabled={!hasOptions}
          activeOpacity={0.88}
        >
          <View style={styles.textStack}>
            <ThemedText style={styles.value}>
              {props.valueLabel ?? props.placeholder}
            </ThemedText>
            {!!props.valueDescription && (
              <ThemedText
                style={[styles.description, { color: textSecondary }]}
              >
                {props.valueDescription}
              </ThemedText>
            )}
          </View>
          <Ionicons
            name="chevron-down"
            size={16}
            color={hasOptions ? primaryColor : textSecondary}
          />
        </TouchableOpacity>
      </View>

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView
          style={[styles.modalContainer, { backgroundColor: cardBg }]}
          edges={["top"]}
        >
          <View
            style={[styles.modalHeader, { borderBottomColor: borderColor }]}
          >
            <ThemedText type="title">{props.label}</ThemedText>
            <TouchableOpacity
              style={[styles.closeButton, { backgroundColor: borderColor }]}
              onPress={() => setOpen(false)}
              activeOpacity={0.88}
            >
              <ThemedText style={[styles.closeText, { color: primaryColor }]}>
                Close
              </ThemedText>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
          >
            {props.options.map((option) => (
              <TouchableOpacity
                key={option.key}
                style={[styles.option, { backgroundColor, borderColor }]}
                onPress={() => {
                  props.onSelect(option.key);
                  setOpen(false);
                }}
                activeOpacity={0.88}
              >
                <ThemedText style={styles.optionLabel}>
                  {option.label}
                </ThemedText>
                {!!option.description && (
                  <ThemedText
                    style={[styles.optionDescription, { color: textSecondary }]}
                  >
                    {option.description}
                  </ThemedText>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fieldSection: { gap: 8 },
  label: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  button: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  buttonDisabled: { opacity: 0.6 },
  textStack: { flex: 1, gap: 2 },
  value: { fontSize: 15, fontWeight: "700" },
  description: { fontSize: 12 },
  modalContainer: { flex: 1 },
  modalHeader: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  closeButton: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  closeText: { fontSize: 12, fontWeight: "600" },
  list: { flex: 1 },
  listContent: { padding: 20, gap: 10 },
  option: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  optionLabel: { fontSize: 15, fontWeight: "700" },
  optionDescription: { fontSize: 12 },
});
