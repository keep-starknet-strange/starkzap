#!/usr/bin/env node
/* global process, require, console */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require("../package.json");
const optionalPeers = Object.entries(pkg.peerDependenciesMeta ?? {})
  .filter(([, meta]) => meta && meta.optional === true)
  .map(([name]) => name);

if (process.env.STARKZAP_NATIVE_SKIP_PEER_CHECK === "1") {
  process.exit(0);
}

if (optionalPeers.length === 0) {
  process.exit(0);
}

const missing = [];

for (const dep of optionalPeers) {
  try {
    require.resolve(dep);
  } catch {
    missing.push(dep);
  }
}

if (missing.length === 0) {
  process.exit(0);
}

const missingList = missing.map((dep) => `  - ${dep}`).join("\n");
const npmInstall = `npm install ${missing.join(" ")}`;
const pnpmInstall = `pnpm add ${missing.join(" ")}`;
const yarnInstall = `yarn add ${missing.join(" ")}`;

console.error(
  [
    "[@starkzap/native] Missing optional React Native polyfill peer dependencies:",
    missingList,
    "",
    "Install them in your app project to avoid Metro bundling errors:",
    `  ${npmInstall}`,
    `  ${pnpmInstall}`,
    `  ${yarnInstall}`,
    "",
    'Also import "@starkzap/native/install" at the top of your app\'s entrypoint.',
  ].join("\n")
);
