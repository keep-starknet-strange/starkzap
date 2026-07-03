// Runtime polyfills the SDK (starknet / ethers) needs on React Native:
// crypto.getRandomValues, TextEncoder/TextDecoder, Buffer.
//
// These must be imported by the app so they land in Metro's module graph;
// starkzap-native's Metro helper (withStarkzap) then hoists them to run before
// the app entry. (They can't be force-injected via Metro's getPolyfills because
// they use `require`, which isn't available in the raw polyfill script scope.)
import "react-native-get-random-values";
import { Buffer } from "buffer";
import "fast-text-encoding";
import "@ethersproject/shims";

const globalWithBuffer = globalThis as { Buffer?: typeof Buffer };
if (!globalWithBuffer.Buffer) {
  globalWithBuffer.Buffer = Buffer;
}
