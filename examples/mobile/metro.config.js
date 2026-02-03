const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const sdkRoot = path.resolve(__dirname, "../..");
const config = getDefaultConfig(__dirname);

// SDK resolution
config.watchFolders = [sdkRoot];
config.resolver.extraNodeModules = { x: sdkRoot };
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, "node_modules"),
  path.resolve(sdkRoot, "node_modules"),
];

// Privy requires browser conditions and package exports handling
config.resolver.unstable_conditionNames = ["browser", "require", "import"];
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Disable package exports for incompatible packages
  if (moduleName === "isows" || moduleName.startsWith("zustand")) {
    return { ...context, unstable_enablePackageExports: false }.resolveRequest(
      { ...context, unstable_enablePackageExports: false },
      moduleName,
      platform
    );
  }
  // Enable package exports for Privy
  if (moduleName.startsWith("@privy-io/")) {
    return { ...context, unstable_enablePackageExports: true }.resolveRequest(
      { ...context, unstable_enablePackageExports: true },
      moduleName,
      platform
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
