const { getDefaultConfig } = require("expo/metro-config");
const { withStarkzap } = require("starkzap-native/metro");
const path = require("path");

// This example lives inside the starkzap monorepo. Metro must watch the
// workspace root so the symlinked `starkzap-native` package (bundled from its
// TS source) and the `starknet` dep hoisted to the root resolve correctly.
const workspaceRoot = path.resolve(__dirname, "../..");
const config = getDefaultConfig(__dirname);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// npm links the root package into its own node_modules to satisfy
// `starkzap-native`'s dependency on `starkzap`: <root>/node_modules/starkzap ->
// <root> (a self-referential symlink). Metro 0.84 crawls it into an infinite
// loop ("Failed to collapse"). Exclude that symlink from the file map...
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const selfLink = path.join(workspaceRoot, "node_modules", "starkzap");
config.resolver.blockList = [].concat(
  config.resolver.blockList ?? [],
  new RegExp(`^${escapeRegExp(selfLink + path.sep)}`)
);

// ...and resolve `starkzap` straight to its built entry instead, so Metro never
// walks node_modules for it (which also trips the 0.84 path-collapse bug).
const coreDist = path.join(workspaceRoot, "dist", "src");
const priorResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "starkzap") {
    return { type: "sourceFile", filePath: path.join(coreDist, "index.js") };
  }
  if (moduleName.startsWith("starkzap/")) {
    const sub = moduleName.slice("starkzap/".length);
    return { type: "sourceFile", filePath: path.join(coreDist, `${sub}.js`) };
  }
  return priorResolveRequest
    ? priorResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

// withStarkzap injects the crypto/text-encoding polyfills and handles the
// ESM/CJS interop that starknet & friends need under Metro. It chains onto the
// resolveRequest set above.
module.exports = withStarkzap(config);
