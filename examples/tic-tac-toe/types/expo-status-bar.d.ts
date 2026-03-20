import type React from "react";

export type StatusBarStyle = "auto" | "dark" | "inverted" | "light";

export const StatusBar: React.ComponentType<{
  style?: StatusBarStyle;
}>;
