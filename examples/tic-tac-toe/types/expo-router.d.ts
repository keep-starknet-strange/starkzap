import type React from "react";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";

export type LinkPressEvent = {
  defaultPrevented: boolean;
  preventDefault: () => void;
};

export type LinkProps = {
  children?: React.ReactNode;
  href: string;
  onPress?: (event: LinkPressEvent) => boolean | void;
  style?: StyleProp<TextStyle | ViewStyle>;
  target?: string;
};

export const Link: React.ComponentType<LinkProps>;

export const ErrorBoundary: React.ComponentType<unknown>;

export type StackProps = {
  children?: React.ReactNode;
};

export type StackScreenProps = {
  name?: string;
  options?: Record<string, unknown>;
};

export type StackComponent = React.ComponentType<StackProps> & {
  Screen: React.ComponentType<StackScreenProps>;
};

export const Stack: StackComponent;
