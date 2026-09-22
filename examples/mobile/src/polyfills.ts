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
import Constants, { ExecutionEnvironment } from "expo-constants";

const globalWithBuffer = globalThis as { Buffer?: typeof Buffer };
if (!globalWithBuffer.Buffer) {
  globalWithBuffer.Buffer = Buffer;
}

// Hermes has no `crypto.subtle`. The STRK20 privacy pool needs it: its OHTTP
// layer runs HPKE (X25519 + HKDF-SHA256 + AES-128-GCM) through `hpke`, which
// reaches for `crypto.subtle` and reports a missing one as
// "DHKEM(X25519, HKDF-SHA256) is unsupported in this runtime".
//
// react-native-quick-crypto supplies it, but it is a Nitro native module and
// several of its modules call `NitroModules.createHybridObject()` in static
// class fields — evaluated on import. In Expo Go that throws and takes the
// whole app down, so this is `require`d behind the check rather than imported.
// `@/core/config` is deliberately not used for the check: it pulls in
// starkzap-native, which must not load before these polyfills.
//
// Only `subtle` is taken. Their `install()` does `global.crypto = QuickCrypto`,
// replacing the object react-native-get-random-values just set up for
// starknet/ethers.
if (
  Constants.executionEnvironment !== ExecutionEnvironment.StoreClient &&
  !globalThis.crypto.subtle
) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { subtle } = require("react-native-quick-crypto") as {
    subtle: SubtleCrypto;
  };
  Object.defineProperty(globalThis.crypto, "subtle", {
    value: subtle,
    configurable: true,
  });
}
