const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const sdkRoot = path.resolve(__dirname, "../..");
const config = getDefaultConfig(__dirname);

// SDK resolution - point directly to source files for development
config.watchFolders = [sdkRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, "node_modules"),
  path.resolve(sdkRoot, "node_modules"),
];

// Custom resolver to handle "starkzap" package and path alias resolution
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Resolve "starkzap" to source files directly
  if (moduleName === "starkzap") {
    return {
      filePath: path.resolve(sdkRoot, "src/index.ts"),
      type: "sourceFile",
    };
  }
  if (moduleName === "starkzap/polyfills") {
    return {
      filePath: path.resolve(sdkRoot, "src/polyfills.ts"),
      type: "sourceFile",
    };
  }

  // Resolve @/* path aliases based on origin
  if (moduleName.startsWith("@/")) {
    const relativePath = moduleName.slice(2); // Remove "@/"

    // If import originates from SDK source, resolve to SDK's src folder
    if (context.originModulePath.startsWith(sdkRoot + "/src")) {
      const resolvedPath = path.resolve(sdkRoot, "src", relativePath);
      return context.resolveRequest(context, resolvedPath, platform);
    }

    // Otherwise, resolve to mobile app root (for mobile app's own @/ alias)
    const mobileRoot = __dirname;
    const resolvedPath = path.resolve(mobileRoot, relativePath);
    return context.resolveRequest(context, resolvedPath, platform);
  }

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

// Privy requires browser conditions and package exports handling
config.resolver.unstable_conditionNames = ["browser", "require", "import"];

module.exports = config;
