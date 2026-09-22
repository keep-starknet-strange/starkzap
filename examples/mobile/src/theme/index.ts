import { useColorScheme } from "react-native";

// One source of truth for colors, spacing and radii so every screen looks the
// same on iOS and Android. Consume via `useTheme()`.

export interface ThemeColors {
  bg: string;
  card: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  primaryText: string;
  accent: string;
  danger: string;
  success: string;
  scrim: string;
}

const palette: { light: ThemeColors; dark: ThemeColors } = {
  light: {
    bg: "#f6f7f9",
    card: "#ffffff",
    text: "#0b0d12",
    textMuted: "#6b7280",
    border: "#e4e7ec",
    primary: "#111827",
    primaryText: "#ffffff",
    accent: "#3b5bff",
    danger: "#dc2626",
    success: "#16a34a",
    scrim: "rgba(0,0,0,0.4)",
  },
  dark: {
    bg: "#0b0d12",
    card: "#15181f",
    text: "#f3f4f6",
    textMuted: "#9aa1ad",
    border: "#262b35",
    primary: "#f3f4f6",
    primaryText: "#0b0d12",
    accent: "#6f86ff",
    danger: "#f87171",
    success: "#4ade80",
    scrim: "rgba(0,0,0,0.5)",
  },
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16 } as const;
export const radius = { sm: 8, md: 12, lg: 16 } as const;

export interface Theme {
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
}

export function useTheme(): Theme {
  const dark = useColorScheme() === "dark";
  return { colors: dark ? palette.dark : palette.light, spacing, radius };
}
