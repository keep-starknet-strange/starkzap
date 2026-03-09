import React from "react";
import { Pressable, StyleSheet, ViewStyle } from "react-native";
import { Text, View } from "@/components/Themed";
import Colors from "@/constants/Colors";
import { useColorScheme } from "@/components/useColorScheme";

type CellValue = "X" | "O" | null;

export type TicTacToeBoardProps = {
  board: CellValue[];
  onCellPress: (index: number) => void;
  disabled?: boolean;
  winningLine?: number[] | null;
  currentPlayer?: "X" | "O";
  style?: ViewStyle;
};

export default function TicTacToeBoard(props: TicTacToeBoardProps) {
  const { board, onCellPress, disabled, winningLine, style } = props;
  const colorScheme = useColorScheme() ?? "light";
  const lineColor = Colors[colorScheme].boardLine as string;
  const winBg = Colors[colorScheme].winHighlight as string;

  return (
    <View
      style={[styles.container, style]}
      lightColor="transparent"
      darkColor="transparent"
    >
      <View style={styles.gridRow}>
        {Array.from({ length: 9 }).map((_, index) => {
          const rowIndex = Math.floor(index / 3);
          const colIndex = index % 3;
          const showRightBorder = colIndex < 2;
          const showBottomBorder = rowIndex < 2;
          const isWinning = winningLine?.includes(index);
          const value = board[index];
          const symbolColor =
            value === "X"
              ? (Colors[colorScheme].xSymbol as string)
              : value === "O"
                ? (Colors[colorScheme].oSymbol as string)
                : (Colors[colorScheme].text as string);

          return (
            <Pressable
              key={index}
              accessibilityRole="button"
              accessibilityLabel={`Cell ${index + 1}`}
              disabled={disabled || value !== null}
              onPress={() => onCellPress(index)}
              style={({ pressed }) => [
                styles.cell,
                {
                  borderRightWidth: showRightBorder
                    ? StyleSheet.hairlineWidth * 2
                    : 0,
                  borderBottomWidth: showBottomBorder
                    ? StyleSheet.hairlineWidth * 2
                    : 0,
                  borderColor: lineColor,
                  backgroundColor: isWinning ? winBg : "transparent",
                  opacity: disabled && value === null ? 0.6 : 1,
                },
                pressed && !disabled && value === null
                  ? { opacity: 0.75 }
                  : null,
              ]}
            >
              <Text style={[styles.symbol, { color: symbolColor }]}>
                {value ?? ""}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    aspectRatio: 1,
    maxWidth: 340,
    alignSelf: "center",
  },
  gridRow: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  cell: {
    width: "33.3333%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  symbol: {
    fontSize: 40,
    fontWeight: "700",
  },
});
