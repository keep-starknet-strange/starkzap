import { Link } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React from "react";
import { Platform } from "react-native";

type LinkPressEvent = {
  defaultPrevented: boolean;
  preventDefault: () => void;
};

export function ExternalLink(
  props: Omit<React.ComponentProps<typeof Link>, "href" | "onPress"> & {
    href: string;
    onPress?: (event: LinkPressEvent) => boolean | void;
  }
) {
  const { href, onPress, ...rest } = props;

  return (
    <Link
      target="_blank"
      {...rest}
      href={href}
      onPress={(e: LinkPressEvent) => {
        const onPressResult = onPress?.(e) as boolean | void | undefined;

        if (onPressResult === false || e.defaultPrevented) {
          e.preventDefault();
          return;
        }

        if (Platform.OS !== "web") {
          // Prevent the default behavior of linking to the default browser on native.
          e.preventDefault();
          // Open the link in an in-app browser.
          void WebBrowser.openBrowserAsync(href);
        }
      }}
    />
  );
}
