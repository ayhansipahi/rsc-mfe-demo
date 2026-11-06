// Lambda Web Functions entry: the runtime loads index.js and probes AWS_LAMBDA_HTTP_ENDPOINT.
// Lambda does not set NODE_ENV; the services read it for the dev-only auth stub.
process.env.NODE_ENV ??= "production";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { addLine, getLines, removeLine } from "./cart.js";

const [host, port] = (process.env.AWS_LAMBDA_HTTP_ENDPOINT || `0.0.0.0:${process.env.PORT ?? 3000}`).split(":");
serve({ fetch: createApp({ getLines, addLine, removeLine }).fetch, hostname: host, port: Number(port) }, () => console.log(`listening on ${host}:${port}`));
