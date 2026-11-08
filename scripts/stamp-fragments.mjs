// Fragment files carry the literal __BUILD__; the owner's build writes stamped copies to
// build/fragments/, which that owner's index.js serves. The stamp is BUILD_ID (the source hash, set by
// the CDK bundler) or, in a local build, the current minute (see ?stitch in the shell layout).
import fs from "node:fs";
import path from "node:path";

export function stamp(srcDir, outDir, value) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const name of fs.readdirSync(srcDir).filter((n) => n.endsWith(".js"))) {
    const src = fs.readFileSync(path.join(srcDir, name), "utf8");
    fs.writeFileSync(path.join(outDir, name), src.replaceAll("__BUILD__", value));
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  stamp("fragments", "build/fragments", process.env.BUILD_ID ?? new Date().toISOString().slice(0, 16) + "Z");
}
