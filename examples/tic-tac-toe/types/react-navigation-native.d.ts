import type React from "react";

export type NavigationTheme = {
  colors: Record<string, string>;
  dark: boolean;
};

export const DarkTheme: NavigationTheme;
export const DefaultTheme: NavigationTheme;

export const ThemeProvider: React.ComponentType<{
  children?: React.ReactNode;
  value: NavigationTheme;
}>;
