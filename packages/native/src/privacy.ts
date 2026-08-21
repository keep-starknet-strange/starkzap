/**
 * Privacy pool: `starkzap-native/privacy`.
 *
 * Forwards `starkzap/privacy` so the native package mirrors core's entry points.
 * The privacy SDK is an optional peer whose types would otherwise become
 * mandatory for every consumer, so its names are not on the root entry.
 */
export * from "starkzap/privacy";
