import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { bundlePackage, sourceHash, sourceInputs } from "./bundle.ts";

const root = path.resolve(import.meta.dirname, "..");

test("apps hash their shell dependency, services do not", () => {
  assert.ok(sourceInputs("apps/orders").includes("shells/web"));
  assert.ok(!sourceInputs("services/orders").includes("shells/web"));
  assert.ok(sourceInputs("services/orders").includes("package-lock.json"));
});

test("the hash ignores build output", () => {
  const before = sourceHash("shells/web");
  execSync("npm run build -w shells/web", { cwd: root, stdio: "ignore" }); // stamps a new time into build/fragments
  assert.equal(sourceHash("shells/web"), before);
});

test("an app bundle carries its own production node_modules with the shell copied in", (t) => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "bundle-"));
  t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  bundlePackage("apps/orders", out);
  assert.ok(fs.existsSync(path.join(out, "index.js")));
  assert.ok(fs.existsSync(path.join(out, "build/server/index.js")));
  assert.equal(fs.lstatSync(path.join(out, "node_modules/@rsc-mfe/shell")).isSymbolicLink(), false);
  assert.ok(fs.existsSync(path.join(out, "node_modules/hono/package.json")));
  assert.ok(!fs.existsSync(path.join(out, "node_modules/aws-cdk-lib")));
  assert.ok(!fs.existsSync(path.join(out, "infra")));
});
