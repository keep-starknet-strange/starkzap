/**
 * Neutral, minimal palette for light and dark mode.
 * Use primary for main actions; card/border for surfaces.
 */

import { Platform } from "react-native";

// Neutral slate/gray palette; single accent for primary actions
const primaryLight = "#374151";
const primaryDark = "#e5e7eb";

export const Colors = {
  light: {
    text: "#111827",
    textSecondary: "#6b7280",
    background: "#ffffff",
    card: "#f8fafc",
    border: "#e2e8f0",
    primary: primaryLight,
    tint: primaryLight,
    icon: "#64748b",
    tabIconDefault: "#64748b",
    tabIconSelected: primaryLight,
  },
  dark: {
    text: "#f1f5f9",
    textSecondary: "#94a3b8",
    background: "#0f1419",
    card: "#1a2332",
    border: "#334155",
    primary: primaryDark,
    tint: primaryDark,
    icon: "#94a3b8",
    tabIconDefault: "#94a3b8",
    tabIconSelected: primaryDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: "system-ui",
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: "ui-serif",
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: "ui-rounded",
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded:
      "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
