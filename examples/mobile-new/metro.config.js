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

// Packages installed in THIS example but lazily `import()`-ed by the prebuilt
// starkzap core (resolved from dist/). Without pinning, those dynamic imports
// resolve from the workspace root (where the packages are absent) and fail at
// runtime. Pin each to the example's own copy.
// Only the BARE specifiers here — those are what starkzap core lazily
// `import()`s. Pinning subpaths (e.g. `ethers/lib/...`) would hijack other
// packages that bring their own version (e.g. @hyperlane-xyz uses ethers v5).
const appNodeModules = path.resolve(__dirname, "node_modules");
const APP_PINNED = ["@avnu/avnu-sdk", "ethers", "@solana/web3.js"];
const priorResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (APP_PINNED.includes(moduleName)) {
    const resolver = priorResolveRequest ?? context.resolveRequest;
    return resolver(context, path.join(appNodeModules, moduleName), platform);
  }
  // starkzap core is resolved from the repo-root dist/, which lives OUTSIDE this
  // app. Its lazy `import()`s of bridge/monitor modules leak to the Metro dev
  // server as package-root paths ("./dist/src/bridge/...") anchored at the app
  // root and fail. Redirect any such specifier to the real repo-root dist.
  const distMatch = moduleName.match(/(?:^|\/)(dist\/src\/.+)$/);
  if (distMatch && moduleName.includes("dist/src/")) {
    const resolver = priorResolveRequest ?? context.resolveRequest;
    return resolver(context, path.join(workspaceRoot, distMatch[1]), platform);
  }
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
