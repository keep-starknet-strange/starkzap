import { Platform, NativeModules } from "react-native";
import turboInstaller from "./NativeController";
import * as controller from "./generated/controller";

const installer =
  Platform.OS === "ios"
    ? turboInstaller
    : turboInstaller || NativeModules.Controller;

if (!installer || typeof installer.installRustCrate !== "function") {
  throw new Error(
    "Controller native module not found. Check module setup and pod install."
  );
}

installer.installRustCrate();
controller.default.initialize();

export * from "./generated/controller";
export default { controller };
