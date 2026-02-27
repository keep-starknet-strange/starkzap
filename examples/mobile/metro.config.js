const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "../..");
const config = getDefaultConfig(__dirname);

// Monorepo resolution (workspace packages + hoisted deps)
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

const defaultResolveRequest = config.resolver.resolveRequest;

// Keep known package-exports compatibility overrides only.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "isows" || moduleName.startsWith("zustand")) {
    const nextContext = { ...context, unstable_enablePackageExports: false };
    const resolver = defaultResolveRequest ?? nextContext.resolveRequest;
    return resolver(nextContext, moduleName, platform);
  }

  if (moduleName.startsWith("@privy-io/")) {
    const nextContext = { ...context, unstable_enablePackageExports: true };
    const resolver = defaultResolveRequest ?? nextContext.resolveRequest;
    return resolver(nextContext, moduleName, platform);
  }

  const resolver = defaultResolveRequest ?? context.resolveRequest;
  return resolver(context, moduleName, platform);
};

// Privy requires browser conditions and package exports handling
config.resolver.unstable_conditionNames = ["browser", "require", "import"];

module.exports = config;
