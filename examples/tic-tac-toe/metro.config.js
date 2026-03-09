/* global require, module, __dirname */
/* eslint-disable @typescript-eslint/no-require-imports */
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "../..");
const appNodeModules = path.resolve(__dirname, "node_modules");
const config = getDefaultConfig(__dirname);

// Monorepo resolution (workspace packages + hoisted deps)
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  appNodeModules,
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  react: path.join(appNodeModules, "react"),
  "react-native": path.join(appNodeModules, "react-native"),
  "react-native-reanimated": path.join(
    appNodeModules,
    "react-native-reanimated"
  ),
};

module.exports = config;
