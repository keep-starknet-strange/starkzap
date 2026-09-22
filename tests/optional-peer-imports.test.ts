import { describe, expect, it } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";

/**
 * Regression guard: optional peer dependencies must never be imported
 * statically from any module reachable from the package entry points.
 *
 * Consumers that don't use bridging/confidential/Solana features must be able
 * to bundle and `import("starkzap")` without installing the optional peers.
 * Bundlers (webpack, esbuild) resolve every static `import`/`export ... from`
 * at build time — including inside modules that are only reached through a
 * dynamic `import()` — so a single static peer import produces hard
 * "Module not found" build failures downstream.
 *
 * Allowed pattern: dynamic `import("<peer>")` behind a lazy runtime loader
 * (`loadEthers`, `loadSolanaWeb3`, `loadHyperlane`, `loadTongo`, ...).
 *
 * Note on `verbatimModuleSyntax` (enabled in tsconfig): only statements
 * written as `import type { ... }` / `export type { ... }` are elided from the
 * emitted JS. Inline forms like `import { type Foo } from "ethers"` still emit
 * `import {} from "ethers"` and are therefore violations too.
 */

const ROOT = resolve(__dirname, "..");
const SRC = join(ROOT, "src");

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
};
const optionalPeers = Object.entries(pkg.peerDependenciesMeta ?? {})
  .filter(([, meta]) => meta.optional)
  .map(([name]) => name);

function isOptionalPeer(specifier: string): string | undefined {
  return optionalPeers.find(
    (peer) => specifier === peer || specifier.startsWith(`${peer}/`)
  );
}

/** Resolve a relative or `@/` alias specifier to a source file path. */
function resolveInternal(from: string, specifier: string): string | undefined {
  let base: string;
  if (specifier.startsWith("@/")) {
    base = join(SRC, specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    base = resolve(dirname(from), specifier);
  } else {
    return undefined; // bare specifier (dependency)
  }
  for (const candidate of [base, `${base}.ts`, join(base, "index.ts")]) {
    if (candidate.endsWith(".json")) return undefined;
    if (candidate.endsWith(".ts") && existsSync(candidate)) return candidate;
  }
  return undefined;
}

type Violation = { file: string; specifier: string };

/**
 * Walks the emitted-JS module graph from the given entry points, following
 * both static imports/re-exports and internal dynamic `import()` calls, and
 * collects every statically emitted reference to an optional peer.
 */
function findStaticPeerImports(entries: string[]): Violation[] {
  const queue = [...entries];
  const seen = new Set<string>();
  const violations: Violation[] = [];

  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);

    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true
    );

    const record = (specifier: string, elided: boolean, dynamic: boolean) => {
      const peer = isOptionalPeer(specifier);
      if (peer) {
        // Dynamic import() of a peer is the sanctioned lazy-loading pattern;
        // fully type-only statements are erased at compile time.
        if (!dynamic && !elided) {
          violations.push({ file: file.slice(ROOT.length + 1), specifier });
        }
        return;
      }
      if (elided) return;
      const target = resolveInternal(file, specifier);
      if (target) queue.push(target);
    };

    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node)) {
        const specifier = (node.moduleSpecifier as ts.StringLiteral).text;
        // Only `import type { ... }` is fully elided under
        // verbatimModuleSyntax; inline `{ type X }` still emits the import.
        record(specifier, node.importClause?.isTypeOnly === true, false);
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
        const specifier = (node.moduleSpecifier as ts.StringLiteral).text;
        record(specifier, node.isTypeOnly, false);
      } else if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length === 1 &&
        ts.isStringLiteralLike(node.arguments[0]!)
      ) {
        record((node.arguments[0] as ts.StringLiteral).text, false, true);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  return violations;
}

describe("optional peer dependencies", () => {
  it("declares optional peers in package.json", () => {
    expect(optionalPeers.length).toBeGreaterThan(0);
  });

  it("are never statically imported from modules reachable from the package entry points", () => {
    const entries = [join(SRC, "index.ts"), join(SRC, "cartridge.ts")].filter(
      (entry) => existsSync(entry)
    );
    expect(entries.length).toBeGreaterThan(0);

    const violations = findStaticPeerImports(entries);

    expect(
      violations,
      violations
        .map(
          (v) =>
            `${v.file} statically imports optional peer "${v.specifier}" — ` +
            `route it through a lazy runtime loader (see src/connect/ethersRuntime.ts) ` +
            `or make the import "import type".`
        )
        .join("\n")
    ).toEqual([]);
  });

  // Sanity check: the walker actually parses imports (guards against the
  // guard silently walking nothing).
  it("walks a non-trivial portion of the source tree", () => {
    const allSrcFiles: string[] = [];
    const collect = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) collect(full);
        else if (entry.name.endsWith(".ts")) allSrcFiles.push(full);
      }
    };
    collect(SRC);

    const seen = new Set<string>();
    const queue = [join(SRC, "index.ts")];
    while (queue.length > 0) {
      const file = queue.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      const source = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true
      );
      const visit = (node: ts.Node) => {
        let specifier: string | undefined;
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
          specifier =
            node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)
              ? node.moduleSpecifier.text
              : undefined;
        } else if (
          ts.isCallExpression(node) &&
          node.expression.kind === ts.SyntaxKind.ImportKeyword &&
          node.arguments.length === 1 &&
          ts.isStringLiteralLike(node.arguments[0]!)
        ) {
          specifier = (node.arguments[0] as ts.StringLiteral).text;
        }
        if (specifier) {
          const target = resolveInternal(file, specifier);
          if (target) queue.push(target);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }

    // The root entry re-exports every subsystem; the reachable graph should
    // cover the majority of src/.
    expect(seen.size).toBeGreaterThan(allSrcFiles.length / 2);
  });
});
