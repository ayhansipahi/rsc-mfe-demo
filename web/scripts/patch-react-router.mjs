// React Router 8.5.1: the server's getManifestRoute (route-discovery patches) omits
// shouldRevalidate, so a layout's shouldRevalidate only applies when the layout was part of
// the first document load. Runs on postinstall; a no-op once a release ships the field.
import fs from "node:fs";

const files = [
  "node_modules/react-router/dist/development/index-react-server.js",
  "node_modules/react-router/dist/production/index-react-server.js",
];

for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  const start = src.indexOf("async function getManifestRoute(route)");
  const end = src.indexOf("async function explodeLazyRoute", start);
  if (start < 0 || end < 0) throw new Error(`getManifestRoute not found in ${file}`);
  const fn = src.slice(start, end);
  if (fn.includes("shouldRevalidate")) {
    console.log(`patch-react-router: already present in ${file}`);
    continue;
  }
  const patched = fn.replace(/(\n(\s*)meta: route\.meta)(\n\s*\};)/, "$1,\n$2shouldRevalidate: route.shouldRevalidate$3");
  if (patched === fn) throw new Error(`patch-react-router: pattern not found in ${file}`);
  fs.writeFileSync(file, src.slice(0, start) + patched + src.slice(end));
  console.log(`patch-react-router: patched ${file}`);
}
