// Lambda Web Functions entry: the runtime loads index.js and probes AWS_LAMBDA_HTTP_ENDPOINT.
import zlib from "node:zlib";
import compression from "compression";
import express from "express";
import { createRequestListener } from "@remix-run/node-fetch-server";

// Must be set before React loads: without it the server uses React's dev build, whose
// Flight payload carries debug rows the production client never hydrates. Static imports
// are hoisted, so the build is imported dynamically below.
process.env.NODE_ENV ??= "production";
// RR 8.5 exports `default: { fetch }`, not a bare handler as the RSC docs show.
const { default: build } = await import("./build/server/index.js");

const [host, port] = (process.env.AWS_LAMBDA_HTTP_ENDPOINT || `0.0.0.0:${process.env.PORT ?? 3000}`).split(":");

const app = express();
// Which deployable answered: visible in response headers, so the split can be shown, not asserted.
app.use((_req, res, next) => { res.setHeader("x-vertical", "account-web"); next(); });
// Static files mount under the same base the client bundle was built with (see vite.config.ts).
const base = "";
// App-to-domain association for passkeys in the mobile shell. Served from here so the RP ID,
// the WebView origin and the associated domain are one hostname.
const appleAppIds = (process.env.APPLE_APP_IDS ?? "").split(",").filter(Boolean);
app.get("/.well-known/apple-app-site-association", (_req, res) => {
  res.type("application/json").send({ webcredentials: { apps: appleAppIds } });
});
const androidPackage = process.env.ANDROID_PACKAGE;
const androidCertShas = (process.env.ANDROID_CERT_SHA256 ?? "").split(",").filter(Boolean);
app.get("/.well-known/assetlinks.json", (_req, res) => {
  res.type("application/json").send(
    androidPackage
      ? [{ relation: ["delegate_permission/common.get_login_creds", "delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: androidPackage, sha256_cert_fingerprints: androidCertShas } }]
      : [],
  );
});
app.use(`${base}/assets`, express.static("build/client/assets", { immutable: true, maxAge: "1y" }));
// The account-button fragment, stamped at build (see scripts/stamp-fragments.mjs). Not content-hashed,
// so a short TTL: a change is live within about two minutes (edge plus browser).
app.use(`${base}/fragments`, express.static("build/fragments", { setHeaders: (res) => res.setHeader("Cache-Control", "public, max-age=60") }));
app.use(
  base || "/",
  express.static("build/client", {
    // Prerendered pages: the CDN keeps them 5 min, browsers always revalidate.
    setHeaders: (res, path) => {
      if (/\.(html|rsc)$/.test(path)) res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300");
      // mime-db has no .rsc entry, so send falls back to application/octet-stream, which
      // CloudFront does not compress. text/x-component is on its compressible list.
      if (path.endsWith(".rsc")) res.setHeader("Content-Type", "text/x-component");
    },
  }),
);
// Neither the Web Functions endpoint nor CloudFront compresses streamed (no Content-Length)
// responses. Flushing every write keeps Suspense chunks streaming instead of buffering them.
app.use(compression({ flush: zlib.constants.Z_SYNC_FLUSH, brotli: { flush: zlib.constants.BROTLI_OPERATION_FLUSH } }));
// TLS ends at the endpoint, so Node sees http:// and the endpoint hostname. React Router compares the
// Origin header with request.url before running an action (CSRF check), so the request URL must be
// the public origin: PUBLIC_HOST is the CloudFront domain, and in that case the protocol is https.
const publicHost = process.env.PUBLIC_HOST;
app.use(createRequestListener(build.fetch, publicHost ? { host: publicHost, protocol: "https:" } : {}));
app.listen(port, host, () => console.log(`listening on ${host}:${port}`));
