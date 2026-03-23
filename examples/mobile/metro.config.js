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

module.exports = withStarkzap(config);
