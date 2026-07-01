const { getDefaultConfig } = require("expo/metro-config");
const { withStarkzap } = require("starkzap-native/metro");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "../..");
const config = getDefaultConfig(__dirname);

// Monorepo resolution: watch workspace root for symlinked local packages,
// resolve from both local and root node_modules.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Pin @avnu/avnu-sdk to a single copy. starkzap's lazy `import("@avnu/avnu-sdk")`
// runs from the workspace-root `starkzap` install and would otherwise resolve a
// different physical copy than the example's own node_modules, giving Metro two
// distinct module ids. Pinning both to one copy lets the eager import (below)
// place that exact module in the main bundle so the lazy import resolves it.
const avnuSdkDir = path.resolve(__dirname, "node_modules/@avnu/avnu-sdk");
const prevResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === "@avnu/avnu-sdk" ||
    moduleName.startsWith("@avnu/avnu-sdk/")
  ) {
    const target = avnuSdkDir + moduleName.slice("@avnu/avnu-sdk".length);
    const resolver = prevResolveRequest ?? context.resolveRequest;
    return resolver(context, target, platform);
  }
  return prevResolveRequest
    ? prevResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = withStarkzap(config);
