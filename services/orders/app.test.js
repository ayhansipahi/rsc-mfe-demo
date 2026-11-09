import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./app.js";

const app = createApp({ listOrders: async (sub) => [{ orderId: "O1", item: "Kbd", total: "1.00", sub }] });

test("GET /orders without a bearer token is 401", async () => {
  const r = await app.request("/orders");
  assert.equal(r.status, 401);
  assert.deepEqual(await r.json(), { error: "unauthorized" });
});

test("GET /orders with the dev stub returns the caller's orders", async () => {
  process.env.NODE_ENV = "development";
  process.env.DEV_SESSION = "me@example.com";
  const r = await app.request("/orders", { headers: { "x-user-token": "dev" } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("x-vertical"), "orders-api");
  assert.equal(r.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await r.json(), [{ orderId: "O1", item: "Kbd", total: "1.00", sub: "dev" }]);
});

test("x-flow-id is echoed when sent and minted when not", async () => {
  const sent = await app.request("/orders", { headers: { "x-flow-id": "flow-7" } });
  assert.equal(sent.headers.get("x-flow-id"), "flow-7");
  const minted = await app.request("/orders");
  assert.match(minted.headers.get("x-flow-id"), /^[0-9a-f-]{36}$/);
});
