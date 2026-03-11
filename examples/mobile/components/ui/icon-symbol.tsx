// Fallback for using Material Icons on Android and web.

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type MaterialIconName = ComponentProps<typeof MaterialIcons>["name"];
type MaterialCommunityIconName = ComponentProps<
  typeof MaterialCommunityIcons
>["name"];

type IconMapping = Record<
  SymbolViewProps["name"],
  | { family: "material"; name: MaterialIconName }
  | { family: "material-community"; name: MaterialCommunityIconName }
>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  "house.fill": { family: "material", name: "home" },
  "paperplane.fill": { family: "material", name: "send" },
  "chevron.left.forwardslash.chevron.right": {
    family: "material",
    name: "code",
  },
  "chevron.right": { family: "material", name: "chevron-right" },
  "wallet.bifold.fill": { family: "material", name: "account-balance-wallet" },
  "chart.line.uptrend.xyaxis": { family: "material", name: "trending-up" },
  "arrow.left.arrow.right": { family: "material", name: "swap-horiz" },
  "building.columns.fill": { family: "material", name: "account-balance" },
  "point.3.connected.trianglepath.dotted": {
    family: "material-community",
    name: "bridge",
  },
  "lock.shield.fill": { family: "material-community", name: "shield-lock" },
} as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  const icon = MAPPING[name];

  if (icon.family === "material-community") {
    return (
      <MaterialCommunityIcons
        color={color}
        size={size}
        name={icon.name}
        style={style}
      />
    );
  }

  return (
    <MaterialIcons color={color} size={size} name={icon.name} style={style} />
  );
}
