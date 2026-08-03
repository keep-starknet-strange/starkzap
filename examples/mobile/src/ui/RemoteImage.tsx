import { View, Image, type ViewStyle } from "react-native";
import { SvgUri } from "react-native-svg";

// Renders a remote logo, handling SVG (via react-native-svg) and raster
// (via Image) — some providers (e.g. Troves) return SVG URLs, which the
// native Image component can't display.
export function RemoteImage({
  uri,
  size,
  style,
}: {
  uri: string;
  size: number;
  style?: ViewStyle;
}) {
  const isSvg = uri.split("?")[0].toLowerCase().endsWith(".svg");
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: "hidden",
        },
        style,
      ]}
    >
      {isSvg ? (
        <SvgUri uri={uri} width={size} height={size} />
      ) : (
        <Image source={{ uri }} style={{ width: size, height: size }} />
      )}
    </View>
  );
}
