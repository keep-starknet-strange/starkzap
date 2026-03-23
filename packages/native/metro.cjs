"use strict";

const path = require("path");

// Every Node built-in module name (assert, http, fs, stream, …).
const ALL_NODE_BUILTINS = new Set(
  require("module").builtinModules.map((m) => m.replace(/^node:/, ""))
);

// Packages whose CJS bundles contain require("fs") / require("path") etc.
// Resolving with the "import" condition picks the ESM entry where those
// requires are wrapped in __require() — a CJS-interop helper that Metro
// does NOT parse as a real module dependency.
const FORCE_ESM = new Set(["starknet", "jose"]);

// ESM-only packages that need the `exports` field to resolve correctly.
const NEEDS_EXPORTS = (name) =>
  name.startsWith("@hyperlane-xyz/") || name.startsWith("@privy-io/");

// Packages that break when Metro resolves them via the `exports` field.
const DISABLE_EXPORTS = (name) =>
  name === "isows" || name.startsWith("zustand");

// Polyfills that starkzap needs at runtime, injected before the app entry.
const POLYFILLS = [
  "react-native-get-random-values",
  "fast-text-encoding",
  "buffer/",
  "@ethersproject/shims",
];

function resolvePolyfills(projectRoot) {
  const resolved = [];
  const missing = [];
  for (const mod of POLYFILLS) {
    try {
      const resolved_path = require.resolve(mod, { paths: [projectRoot] });
      // Ignore Node built-in identifiers (e.g. "buffer") that aren't real file paths.
      if (path.isAbsolute(resolved_path)) {
        resolved.push(resolved_path);
      } else {
        missing.push(mod);
      }
    } catch {
      missing.push(mod);
    }
  }
  if (missing.length > 0) {
    const list = missing.map((m) => `  - ${m}`).join("\n");
    const install = `npm install ${missing.join(" ")}`;
    console.warn(
      `\n[starkzap-native] Missing required polyfills:\n${list}\n\n` +
        `Install them to avoid runtime crashes:\n  ${install}\n`
    );
  }
  return resolved;
}

/**
 * Apply Starkzap Metro configuration.
 *
 * - Injects React Native polyfills (TextEncoder, crypto.getRandomValues, etc.)
 *   before the app entry point — no custom entrypoint file needed.
 * - Handles ESM/CJS interop for starkzap's transitive dependencies so
 *   consumers don't have to maintain package-specific resolver rules.
 *
 * @example
 * ```js
 * // metro.config.js
 * const { getDefaultConfig } = require("expo/metro-config");
 * const { withStarkzap } = require("starkzap-native/metro");
 *
 * const config = getDefaultConfig(__dirname);
 * module.exports = withStarkzap(config);
 * ```
 *
 * The function chains with any existing `config.resolver.resolveRequest`,
 * so you can add your own resolver rules before calling `withStarkzap`:
 *
 * @example
 * ```js
 * config.resolver.resolveRequest = (context, moduleName, platform) => {
 *   // your app-specific overrides here …
 *   return context.resolveRequest(context, moduleName, platform);
 * };
 * module.exports = withStarkzap(config);
 * ```
 */
function withStarkzap(config) {
  // --- Polyfills -----------------------------------------------------------
  const projectRoot = config.projectRoot || process.cwd();
  const polyfills = resolvePolyfills(projectRoot);

  // Detect which Node built-in names have real npm polyfill packages installed
  // (e.g. "events", "buffer", "util"). Those must NOT be stubbed — Metro
  // should resolve them to the npm package. Everything else gets { type: "empty" }.
  // We resolve "<mod>/package.json" instead of "<mod>" because require.resolve
  // returns the bare built-in name (e.g. "events") for Node built-ins, which
  // isn't an absolute path. Resolving package.json forces filesystem lookup.
  const hasNpmPackage = new Set();
  for (const mod of ALL_NODE_BUILTINS) {
    try {
      require.resolve(mod + "/package.json", { paths: [projectRoot] });
      hasNpmPackage.add(mod);
    } catch {
      // No npm package — will be stubbed.
    }
  }
  if (polyfills.length > 0) {
    config.serializer = config.serializer || {};
    const origFn = config.serializer.getModulesRunBeforeMainModule;
    config.serializer.getModulesRunBeforeMainModule = (entryFilePath) => {
      const prev = origFn ? origFn(entryFilePath) : [];
      return [...prev, ...polyfills];
    };
  }

  // --- Resolver overrides --------------------------------------------------
  config.resolver = config.resolver || {};
  const prev = config.resolver.resolveRequest;

  // The native package uses @/* path aliases (tsconfig paths) that map to
  // packages/native/src/*. When Metro reads the source directly (via the
  // "source" field), it needs to resolve these aliases at bundle time.
  const nativeSrcDir = path.resolve(__dirname, "src");

  config.resolver.resolveRequest = (context, moduleName, platform) => {
    // Resolve @/* imports originating from the native package's own source.
    if (
      moduleName.startsWith("@/") &&
      context.originModulePath.startsWith(nativeSrcDir)
    ) {
      const resolved = path.join(nativeSrcDir, moduleName.slice(2));
      const resolver = prev ?? context.resolveRequest;
      return resolver(context, resolved, platform);
    }
    const bare = moduleName.startsWith("node:")
      ? moduleName.slice(5)
      : moduleName;
    if (ALL_NODE_BUILTINS.has(bare) && !hasNpmPackage.has(bare)) {
      return { type: "empty" };
    }

    if (FORCE_ESM.has(moduleName)) {
      return context.resolveRequest(
        {
          ...context,
          unstable_enablePackageExports: true,
          unstable_conditionNames: ["browser", "import"],
        },
        moduleName,
        platform
      );
    }

    if (DISABLE_EXPORTS(moduleName)) {
      return context.resolveRequest(
        { ...context, unstable_enablePackageExports: false },
        moduleName,
        platform
      );
    }

    if (NEEDS_EXPORTS(moduleName)) {
      return context.resolveRequest(
        {
          ...context,
          unstable_enablePackageExports: true,
          unstable_conditionNames: ["browser"],
        },
        moduleName,
        platform
      );
    }

    // Delegate to the consumer's own resolver, if any.
    if (prev) return prev(context, moduleName, platform);
    return context.resolveRequest(context, moduleName, platform);
  };

  return config;
}

module.exports = { withStarkzap };
