// Lambda Web Functions entry: the runtime loads index.js and probes AWS_LAMBDA_HTTP_ENDPOINT.
// Lambda does not set NODE_ENV; without it express sends stack traces to callers.
process.env.NODE_ENV ??= "production";
import { createApp } from "./app.js";
import { listOrders } from "./orders.js";

const [host, port] = (process.env.AWS_LAMBDA_HTTP_ENDPOINT || `0.0.0.0:${process.env.PORT ?? 3000}`).split(":");
createApp({ listOrders }).listen(port, host, () => console.log(`listening on ${host}:${port}`));
