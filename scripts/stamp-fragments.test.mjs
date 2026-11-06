import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { stamp } from "./stamp-fragments.mjs";

test("stamp replaces every __BUILD__ into build/fragments", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stamp-"));
  fs.mkdirSync(path.join(dir, "fragments"));
  fs.writeFileSync(path.join(dir, "fragments/a.js"), 'x="__BUILD__";y="__BUILD__"');
  stamp(path.join(dir, "fragments"), path.join(dir, "build/fragments"), "2026-11-06T10:00Z");
  assert.equal(fs.readFileSync(path.join(dir, "build/fragments/a.js"), "utf8"), 'x="2026-11-06T10:00Z";y="2026-11-06T10:00Z"');
});
