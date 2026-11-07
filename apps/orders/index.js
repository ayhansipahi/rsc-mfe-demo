// Lambda Web Functions entry: the runtime loads index.js and probes AWS_LAMBDA_HTTP_ENDPOINT.
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { compress, requestLog } from "@rsc-mfe/shell/node.server";

// Must be set before React loads: without it the server uses React's dev build, whose
// Flight payload carries debug rows the production client never hydrates. Static imports
// are hoisted, so the build is imported dynamically below.
process.env.NODE_ENV ??= "production";
// RR 8.5 exports `default: { fetch }`, not a bare handler as the RSC docs show.
const { default: build } = await import("./build/server/index.js");

const [host, port] = (process.env.AWS_LAMBDA_HTTP_ENDPOINT || `0.0.0.0:${process.env.PORT ?? 3000}`).split(":");

// Static files mount under the same base the client bundle was built with (see vite.config.ts).
const base = "/orders-static";
const fromClient = (dir, onFound) =>
  serveStatic({ root: `./build/${dir}`, rewriteRequestPath: (p) => p.slice(base.length), mimes: { rsc: "text/x-component" }, onFound });

const app = new Hono();
app.use(requestLog("orders-web"));
// Hashed assets: CloudFront serves them from S3; this is the fallback nobody should hit.
app.use(`${base}/assets/*`, fromClient("client", (_p, c) => c.header("Cache-Control", "public, max-age=31536000, immutable")));
// Prerendered pages: the CDN keeps them 5 min, browsers always revalidate.
app.use(`${base}/*`, fromClient("client", (p, c) => { if (/\.(html|rsc)$/.test(p)) c.header("Cache-Control", "public, max-age=0, s-maxage=300"); }));
app.use(compress());
// TLS ends at the endpoint, so Node sees http:// and the endpoint hostname. React Router compares the
// Origin header with request.url before running an action (CSRF check), so the request URL must be
// the public origin: PUBLIC_HOST is the CloudFront domain, and in that case the protocol is https.
const publicHost = process.env.PUBLIC_HOST;
app.all("*", (c) => {
  const req = c.req.raw;
  const url = new URL(req.url);
  if (publicHost) {
    url.protocol = "https:";
    url.host = publicHost;
  }
  // A real Request, spelled out: React Router does not match routes on the node-server's lazy
  // Request, and undici does not accept it as init either.
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : req.body;
  return build.fetch(new Request(url, { method: req.method, headers: req.headers, body, duplex: "half", signal: req.signal }));
});
serve({ fetch: app.fetch, hostname: host, port: Number(port) }, () => console.log(`listening on ${host}:${port}`));
