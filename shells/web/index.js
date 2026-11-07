// The shell's web function: it serves the header and footer fragments, nothing else. Pages are the
// apps' business. Lambda Web Functions load index.js and probe AWS_LAMBDA_HTTP_ENDPOINT.
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { requestLog } from "./src/node.server.js";

process.env.NODE_ENV ??= "production";

const [host, port] = (process.env.AWS_LAMBDA_HTTP_ENDPOINT || `0.0.0.0:${process.env.PORT ?? 3000}`).split(":");

const app = new Hono();
app.use(requestLog("shell-web"));
// Not content-hashed, so a short TTL: a shell change is live within about two minutes (edge plus
// browser). CORS is for an app running standalone with SHELL_ORIGIN on another port; in production
// everything is one host. ponytail: version the URLs if instant rollout ever matters.
app.use(
  "/shell-static/fragments/*",
  serveStatic({
    root: "./build/fragments",
    rewriteRequestPath: (p) => p.replace(/^\/shell-static\/fragments/, ""),
    onFound: (_path, c) => {
      c.header("Cache-Control", "public, max-age=60");
      c.header("Access-Control-Allow-Origin", "*");
    },
  }),
);
serve({ fetch: app.fetch, hostname: host, port: Number(port) }, () => console.log(`listening on ${host}:${port}`));
