import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const docsDir = path.join(root, "docs");
const apiDir = path.join(docsDir, "api");
const exportDir = path.join(docsDir, "export");
const guideSrc = path.join(docsDir, "guide.md");
const guideDest = path.join(exportDir, "DEVELOPER_GUIDE.md");

if (!fs.existsSync(guideSrc)) {
  throw new Error(`Missing developer guide: ${guideSrc}`);
}

if (!fs.existsSync(apiDir)) {
  throw new Error(
    `Missing generated API docs: ${apiDir}. Run npm run docs:api first.`
  );
}

fs.rmSync(exportDir, { recursive: true, force: true });
fs.mkdirSync(exportDir, { recursive: true });

fs.copyFileSync(guideSrc, guideDest);
fs.cpSync(apiDir, path.join(exportDir, "api"), { recursive: true });

const pkg = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8")
);
const manifest = {
  name: pkg.name,
  version: pkg.version,
  generatedAt: new Date().toISOString(),
  contents: ["DEVELOPER_GUIDE.md", "api/README.md"],
};

fs.writeFileSync(
  path.join(exportDir, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8"
);

fs.writeFileSync(
  path.join(exportDir, "README.md"),
  [
    "# Exported Documentation",
    "",
    "- Start with `DEVELOPER_GUIDE.md` for onboarding and workflows.",
    "- Use `api/README.md` for the generated API reference.",
    "- `manifest.json` contains package version and export timestamp.",
    "",
  ].join("\n"),
  "utf8"
);

console.log(`Exported docs to ${exportDir}`);
