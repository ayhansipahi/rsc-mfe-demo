import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { listOrders } from "./orders.server.ts";

test("an unreachable orders service is a 502 Response", async () => {
  process.env.ORDERS_API_URL = "http://127.0.0.1:1";
  await assert.rejects(listOrders({ token: "t" }), (e: unknown) => e instanceof Response && e.status === 502);
});

test("orders come from the service with the user token and flow id", async () => {
  let auth: string | undefined, flow: string | string[] | undefined;
  const server = http.createServer((req, res) => {
    auth = req.headers["x-user-token"] as string | undefined;
    flow = req.headers["x-flow-id"];
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify([{ orderId: "O1", item: "Kbd", total: "1.00" }]));
  });
  await new Promise<void>((ok) => server.listen(0, ok));
  process.env.ORDERS_API_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    assert.deepEqual(await listOrders({ token: "t", flow: "flow-3" }), [{ orderId: "O1", item: "Kbd", total: "1.00" }]);
    assert.equal(auth, "t");
    assert.equal(flow, "flow-3");
  } finally {
    server.close();
  }
});

test("a service that accepts the connection but never answers is a 502, not a hang", async () => {
  const server = http.createServer(() => {});
  await new Promise<void>((ok) => server.listen(0, ok));
  process.env.ORDERS_API_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  process.env.SERVICE_TIMEOUT_MS = "200";
  try {
    await assert.rejects(listOrders({ token: "t" }), (e: unknown) => e instanceof Response && e.status === 502);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});
