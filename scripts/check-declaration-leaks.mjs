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
 * Every published entry point is checked, not just the root: a subpath has its
 * own module graph, so a peer leaking into `starkzap/privacy` is invisible from
 * `starkzap`. No peer is installed for any of them. Instead each entry declares
 * the peers it is *allowed* to name -- the subject of that subpath -- and an
 * unresolved module outside that list is the leak.
 *
 * Usage: node scripts/check-declaration-leaks.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = process.cwd();
const work = mkdtempSync(join(tmpdir(), "starkzap-decl-"));

/**
 * The published entry points, and the optional peers each may legitimately name.
 *
 * Keep in step with `exports` in package.json. An entry missing from here is
 * never checked, which is the failure mode this list exists to prevent.
 */
const ENTRIES = [
  // The root entry may name none of them: every consumer's module graph reaches
  // it, whichever features they use.
  { specifier: "starkzap", allowed: [] },
  // The privacy SDK is what this subpath is *for*, so its types are named on
  // purpose. Anything else appearing here is the leak.
  {
    specifier: "starkzap/privacy",
    allowed: ["@starkware-libs/starknet-privacy-sdk"],
  },
  { specifier: "starkzap/cartridge", allowed: ["@cartridge/controller"] },
];

/**
 * Errors in shipped declarations, minus the peers this entry is allowed to name.
 *
 * An unresolvable import is `TS2307` and names the module, so the allowance is
 * matched against that name -- and its subpaths, since a peer's `/testing` entry
 * is the same dependency.
 */
function leaks(output, allowed) {
  return output
    .split("\n")
    .filter(
      (line) =>
        line.includes("node_modules/starkzap/") && line.includes("error TS")
    )
    .filter((line) => {
      const missing = /error TS2307: Cannot find module '([^']+)'/.exec(
        line
      )?.[1];
      return !(
        missing &&
        allowed.some(
          (peer) => missing === peer || missing.startsWith(`${peer}/`)
        )
      );
    })
    .map((line) => line.replace(/^.*node_modules\/starkzap\//, ""));
}

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
  // One fixture per entry point: a namespace import reaches every re-export, and
  // separate typecheck runs keep each entry's allowance to itself.
  ENTRIES.forEach(({ specifier }, index) => {
    writeFileSync(
      join(work, `consumer-${index}.ts`),
      `import * as entry from "${specifier}";\n` +
        `export const exportCount = Object.keys(entry).length;\n`
    );
    writeFileSync(
      join(work, `tsconfig-${index}.json`),
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
        files: [`consumer-${index}.ts`],
      })
    );
  });

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

  let failed = false;
  ENTRIES.forEach(({ specifier, allowed }, index) => {
    console.log(`• typechecking \`${specifier}\` as a consumer would`);
    const tsc = run(
      join(repo, "node_modules", ".bin", "tsc"),
      ["-p", `tsconfig-${index}.json`],
      work
    );

    const ours = leaks(tsc.out, allowed);
    if (ours.length === 0) return;

    failed = true;
    console.error(
      `\n✗ ${ours.length} error(s) reaching \`${specifier}\`. A consumer with only\n` +
        `  ${allowed.length > 0 ? allowed.join(", ") : "no optional peer"} installed cannot typecheck against this build:\n`
    );
    for (const line of ours) console.error(`    ${line}`);
  });

  if (failed) {
    console.error(
      "\n  Fix by keeping the peer's types out of anything reachable from that entry\n" +
        "  point: move them to a module the barrels do not re-export, or replace them\n" +
        "  with types this package owns. See src/bridge/ethereum/ethers-interop.ts and\n" +
        "  src/confidential/tongoRuntime.ts for the two shapes that work.\n"
    );
    process.exitCode = 1;
  } else {
    console.log("\n✓ no entry point requires a peer it is not allowed to name");
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
