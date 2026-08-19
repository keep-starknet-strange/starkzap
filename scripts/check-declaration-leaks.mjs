#!/usr/bin/env node
/**
 * Fail if a shipped declaration file needs an optional peer dependency.
 *
 * The optional peers (`ethers`, `@fatsolutions/tongo-sdk`, the privacy SDK, …)
 * are reached at runtime through lazy loaders, so a consumer who does not use
 * those features never installs them. But a `.d.ts` that *names* one has to
 * resolve it for anyone whose module graph reaches that file — which for a
 * barrel-exported type is everyone. Under the usual `skipLibCheck: true` the
 * import silently degrades to `any`; under `skipLibCheck: false` it is a hard
 * `TS2307`.
 *
 * Nothing in-repo can catch this: `npm run typecheck` has every peer present in
 * devDependencies, so the leak is invisible exactly where it is introduced. The
 * only faithful check is the consumer's position — install the packed tarball on
 * its own and typecheck against it.
 *
 * Errors from other packages' declarations are ignored. `starknet` is a required
 * dependency and its own `.d.ts` does not pass `skipLibCheck: false` (`TS2417`,
 * two incompatible `WalletAccount` versions), which is not ours to fix. This
 * gate is scoped to declarations starkzap ships.
 *
 * Usage: node scripts/check-declaration-leaks.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = process.cwd();
const work = mkdtempSync(join(tmpdir(), "starkzap-decl-"));

/** Run a command, returning stdout and never throwing on a non-zero exit. */
function run(command, args, cwd) {
  try {
    return {
      status: 0,
      out: execFileSync(command, args, {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    };
  } catch (error) {
    return {
      status: error.status ?? 1,
      out: `${error.stdout ?? ""}${error.stderr ?? ""}`,
    };
  }
}

try {
  console.log("• packing the library");
  const packed = run("npm", ["pack", "--pack-destination", work], repo);
  if (packed.status !== 0) {
    console.error(packed.out);
    throw new Error("npm pack failed");
  }
  const tarball = readdirSync(work).find((f) => f.endsWith(".tgz"));
  if (!tarball) throw new Error("npm pack produced no tarball");

  // A consumer that imports the package and nothing else. No optional peers are
  // installed, which is the whole point — `starknet` arrives as a dependency of
  // the tarball.
  writeFileSync(
    join(work, "package.json"),
    JSON.stringify({
      name: "declaration-leak-fixture",
      private: true,
      type: "module",
    })
  );
  writeFileSync(
    join(work, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        noEmit: true,
        // The flag that makes a leak visible rather than silently `any`.
        skipLibCheck: false,
      },
      files: ["consumer.ts"],
    })
  );
  // A namespace import, so every re-export from the root entry is reached.
  writeFileSync(
    join(work, "consumer.ts"),
    'import * as starkzap from "starkzap";\nexport const exportCount = Object.keys(starkzap).length;\n'
  );

  console.log("• installing the tarball with no optional peers");
  const install = run(
    "npm",
    ["install", `./${tarball}`, "--no-audit", "--no-fund", "--silent"],
    work
  );
  if (install.status !== 0) {
    console.error(install.out);
    throw new Error("installing the tarball failed");
  }

  console.log("• typechecking as a consumer would");
  const tsc = run(
    join(repo, "node_modules", ".bin", "tsc"),
    ["-p", "tsconfig.json"],
    work
  );

  const ours = tsc.out
    .split("\n")
    .filter(
      (line) =>
        line.includes("node_modules/starkzap/") && line.includes("error TS")
    )
    .map((line) => line.replace(/^.*node_modules\/starkzap\//, ""));

  if (ours.length > 0) {
    console.error(
      `\n✗ ${ours.length} error(s) in shipped declarations. A consumer without the\n` +
        "  optional peers cannot typecheck against this build:\n"
    );
    for (const line of ours) console.error(`    ${line}`);
    console.error(
      "\n  Fix by keeping the peer's types out of anything reachable from the package\n" +
        "  entry: move them to a module the barrels do not re-export, or replace them\n" +
        "  with types this package owns. See src/bridge/ethereum/ethers-interop.ts and\n" +
        "  src/confidential/tongoRuntime.ts for the two shapes that work.\n"
    );
    process.exitCode = 1;
  } else {
    console.log("\n✓ no shipped declaration requires an optional peer");
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
