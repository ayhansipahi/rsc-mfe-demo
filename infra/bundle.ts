import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { FileSystem } from "aws-cdk-lib";

const root = path.resolve(import.meta.dirname, "..");
const ignoredInHash = ["node_modules", "build", ".react-router", "infra"];

type Manifest = { dependencies?: Record<string, string> };

function fileDependencies(pkgDir: string): Record<string, string> {
  const manifest: Manifest = JSON.parse(fs.readFileSync(path.join(root, pkgDir, "package.json"), "utf8"));
  return Object.fromEntries(Object.entries(manifest.dependencies ?? {}).filter(([, spec]) => spec.startsWith("file:")));
}

/** Repo-relative paths whose content defines the package's build. */
export function sourceInputs(pkgDir: string): string[] {
  const deps = Object.values(fileDependencies(pkgDir)).map((spec) =>
    path.relative(root, path.resolve(root, pkgDir, spec.slice("file:".length))),
  );
  return [pkgDir, ...deps, "package-lock.json", "scripts"];
}

/** Hash of the sources, never of build output (builds stamp the time into build/fragments). */
export function sourceHash(pkgDir: string): string {
  const hash = createHash("sha256");
  for (const input of sourceInputs(pkgDir)) {
    const full = path.join(root, input);
    const fingerprint = fs.statSync(full).isFile()
      ? FileSystem.fingerprint(full)
      : FileSystem.fingerprint(full, { exclude: ignoredInHash });
    hash.update(`${input}:${fingerprint}\n`);
  }
  return hash.digest("hex");
}

/** Build one workspace and give it its own production node_modules, as a Lambda Web Function expects. */
export function bundlePackage(pkgDir: string, outDir: string): void {
  const run = (cmd: string, args: string[], cwd: string) => execFileSync(cmd, args, { cwd, stdio: "inherit" });
  run("npm", ["run", "build", "-w", pkgDir], root);

  const skipped = new Set(["node_modules", ".react-router", "infra"]);
  fs.cpSync(path.join(root, pkgDir), outDir, {
    recursive: true,
    filter: (src) => {
      const name = path.basename(src);
      return !skipped.has(name) && !/\.test\./.test(name);
    },
  });

  // Workspace dependencies become absolute paths so the isolated install can copy them in.
  const manifestPath = path.join(outDir, "package.json");
  const manifest: Manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  for (const [name, spec] of Object.entries(fileDependencies(pkgDir))) {
    manifest.dependencies![name] = `file:${path.resolve(root, pkgDir, spec.slice("file:".length))}`;
  }
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  run(
    "npm",
    ["install", "--omit=dev", "--workspaces=false", "--install-links", "--no-package-lock", "--no-fund", "--no-audit"],
    outDir,
  );
  run("node", [path.join(root, "scripts/patch-react-router.mjs")], outDir);
}
