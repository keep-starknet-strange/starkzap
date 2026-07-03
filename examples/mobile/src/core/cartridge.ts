import * as WebBrowser from "expo-web-browser";
import { registerCartridgeTsAdapter } from "starkzap-native";

// starkzap-native ships a pure-TS Cartridge session adapter but leaves the
// "open the auth page" step to the host app. On React Native we open Cartridge
// in an in-app browser and hand the redirect back to the adapter. Register once.
let registered = false;

export function ensureCartridgeAdapter() {
  if (registered) return;
  registerCartridgeTsAdapter({
    openSession: async ({ url, redirectUrl }) => {
      const result = await WebBrowser.openAuthSessionAsync(
        url,
        redirectUrl ?? undefined
      );
      if (result.type === "success") {
        return { callbackUrl: result.url, status: "success" };
      }
      if (result.type === "cancel") return { status: "cancel" };
      // dismiss / other: let the adapter fall back to subscription polling.
      return { status: "dismiss" };
    },
  });
  registered = true;
}
