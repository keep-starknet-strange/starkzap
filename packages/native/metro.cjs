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

// Browser-only packages that starkzap core reaches through a lazy `import()`.
// The call never runs on React Native, but Metro still walks it into the graph,
// so the package has to at least *bundle*. @cartridge/controller cannot: it
// drives a browser keychain (iframe/popup) and its dist carries a
// module-federation loader that calls `import(variable)`, which Metro rejects
// outright ("Invalid call at line 4: import(t)"). Native apps use
// `registerCartridgeTsAdapter` instead. Stubbing keeps the graph buildable, and
// core's own module-shape check turns the empty module into its existing
// "Cartridge integration requires '@cartridge/controller'" error if the web
// flow is ever called from RN.
const WEB_ONLY = (name) =>
  name === "@cartridge/controller" || name.startsWith("@cartridge/controller/");

// Polyfills hoisted to run before the app entry (when present in the graph).
// REQUIRED: needed by every StarkZap flow — starknet hashes an entrypoint
//   selector via TextEncoder on every contract read/write. Warned about when
//   absent.
// OPTIONAL: needed only by specific features, so hoisted when present but NOT
//   warned about (avoids nagging apps that don't use them):
//     react-native-get-random-values → Cartridge sessions, paymaster/outside-
//       execution (SNIP-9) nonces, random key generation. Deterministic signing
//       and reads do NOT need it, and noble already throws a clear error.
//     buffer / @ethersproject/shims → the Ethereum/Solana bridge (ethers).
const REQUIRED_POLYFILLS = ["fast-text-encoding"];
const OPTIONAL_POLYFILLS = [
  "react-native-get-random-values",
  "buffer/",
  "@ethersproject/shims",
];
const POLYFILLS = [...REQUIRED_POLYFILLS, ...OPTIONAL_POLYFILLS];

function resolvePolyfills(projectRoot) {
  const resolved = [];
  const missing = [];
  for (const mod of POLYFILLS) {
    try {
      const resolved_path = require.resolve(mod, { paths: [projectRoot] });
      // Ignore Node built-in identifiers (e.g. "buffer") that aren't real file paths.
      if (path.isAbsolute(resolved_path)) {
        resolved.push(resolved_path);
      } else if (REQUIRED_POLYFILLS.includes(mod)) {
        missing.push(mod);
      }
    } catch {
      if (REQUIRED_POLYFILLS.includes(mod)) missing.push(mod);
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
 * - Handles ESM/CJS interop for starkzap's transitive dependencies (starknet,
 *   jose, Node built-in stubbing, package `exports` quirks) so consumers don't
 *   have to maintain package-specific resolver rules. This is the main job.
 * - Hoists the required React Native polyfills (TextEncoder,
 *   crypto.getRandomValues, Buffer, …) to run before the app entry.
 *
 * IMPORTANT: hoisting only *reorders* modules already in Metro's graph — it
 * cannot inject them. Your app MUST still import the polyfill packages once at
 * its entry so they enter the graph; withStarkzap then guarantees they run
 * first. Skipping the import means starknet crashes at runtime.
 *
 * ```ts
 * // app entry (e.g. index.js / root layout), before any StarkZap usage.
 * // Required by every StarkZap flow (starknet selector encoding):
 * import "fast-text-encoding";
 * // Cartridge sessions / paymaster (SNIP-9) / random key generation:
 * import "react-native-get-random-values";
 * // Ethereum/Solana bridge only:
 * import { Buffer } from "buffer";
 * import "@ethersproject/shims";
 * if (!globalThis.Buffer) globalThis.Buffer = Buffer;
 * ```
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

    if (WEB_ONLY(moduleName)) {
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
