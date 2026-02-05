/**
 * React Native polyfills for Starknet.
 *
 * Import this ONCE at your app's entry point before any other imports:
 *
 * @example
 * ```ts
 * // App entry (e.g., index.js or App.tsx)
 * import "x/polyfills";
 * import { StarkSDK } from "x";
 * ```
 *
 * Required peer dependencies (install these in your React Native project):
 * - react-native-get-random-values
 * - fast-text-encoding
 * - @ethersproject/shims
 */

// Crypto.getRandomValues - MUST be first
import "react-native-get-random-values";

// TextEncoder/TextDecoder
import "fast-text-encoding";

// Buffer and other ethers shims
import "@ethersproject/shims";
