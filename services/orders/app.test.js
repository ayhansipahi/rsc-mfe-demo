import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./app.js";

let server, base;
before(() => new Promise((ok) => {
  server = createApp({ listOrders: async (sub) => [{ orderId: "O1", item: "Kbd", total: "1.00", sub }] }).listen(0, () => {
    base = `http://127.0.0.1:${server.address().port}`;
    ok();
  });
}));
after(() => server.close());

test("GET /orders without a bearer token is 401", async () => {
  const r = await fetch(`${base}/orders`);
  assert.equal(r.status, 401);
  assert.deepEqual(await r.json(), { error: "unauthorized" });
});

test("GET /orders with the dev stub returns the caller's orders", async () => {
  process.env.NODE_ENV = "development";
  process.env.DEV_SESSION = "me@example.com";
  const r = await fetch(`${base}/orders`, { headers: { authorization: "Bearer dev" } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("x-vertical"), "orders-api");
  assert.equal(r.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await r.json(), [{ orderId: "O1", item: "Kbd", total: "1.00", sub: "dev" }]);
});
