// Hono middlewares every function's index.js uses. Plain JS: index.js runs on Node without a build.
import zlib from "node:zlib";
import { Readable } from "node:stream";

// One JSON line per request with the flow id: the id comes in on x-flow-id (an app forwards it to
// its service, see serviceHeaders), is minted here otherwise, and goes back out on the response.
// Grep CloudWatch for one id and you have the page and every service call behind it.
export const requestLog = (vertical, write = (line) => console.log(line)) => async (c, next) => {
  const flow = c.req.header("x-flow-id") ?? crypto.randomUUID();
  c.req.raw.headers.set("x-flow-id", flow);
  const t = performance.now();
  await next();
  // On c.res, not c.header(): a handler that returns a raw Response (the React Router build does)
  // would otherwise drop them.
  c.res.headers.set("x-vertical", vertical);
  c.res.headers.set("x-flow-id", flow);
  const path = new URL(c.req.url).pathname;
  write(JSON.stringify({ flow, vertical, method: c.req.method, path, status: c.res.status, ms: Math.round(performance.now() - t) }));
};

// Neither the Web Functions endpoint nor CloudFront compresses streamed (no Content-Length)
// responses, and the web CompressionStream holds data back; zlib with a per-write flush keeps
// Suspense chunks streaming. Text only: images and fonts are already packed.
const TEXT = /^(text\/|application\/(json|javascript|xml)|image\/svg)/;
export const compress = () => async (c, next) => {
  await next();
  const accept = c.req.header("accept-encoding") ?? "";
  const res = c.res;
  if (!res.body || res.headers.has("content-encoding") || !TEXT.test(res.headers.get("content-type") ?? "")) return;
  const br = /\bbr\b/.test(accept);
  if (!br && !/\bgzip\b/.test(accept)) return;
  const z = br
    ? zlib.createBrotliCompress({ flush: zlib.constants.BROTLI_OPERATION_FLUSH })
    : zlib.createGzip({ flush: zlib.constants.Z_SYNC_FLUSH });
  const headers = new Headers(res.headers);
  headers.set("content-encoding", br ? "br" : "gzip");
  headers.delete("content-length");
  headers.append("vary", "accept-encoding");
  c.res = new Response(Readable.toWeb(Readable.fromWeb(res.body).pipe(z)), { status: res.status, headers });
};
