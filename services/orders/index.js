// Lambda Web Functions entry: the runtime loads index.js and probes AWS_LAMBDA_HTTP_ENDPOINT.
import { createApp } from "./app.js";
import { listOrders } from "./orders.js";

const [host, port] = (process.env.AWS_LAMBDA_HTTP_ENDPOINT || `0.0.0.0:${process.env.PORT ?? 3000}`).split(":");
createApp({ listOrders }).listen(port, host, () => console.log(`listening on ${host}:${port}`));
