import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./app.js";

const lines = new Map();
const calls = [];
const fakes = {
  getLines: async (sub) => [...lines].filter(([k]) => k.startsWith(sub + "/")).map(([k, qty]) => ({ productId: k.split("/")[1], qty })),
  addLine: async (sub, id) => { calls.push(["add", id]); lines.set(`${sub}/${id}`, (lines.get(`${sub}/${id}`) ?? 0) + 1); },
  removeLine: async (sub, id) => { calls.push(["remove", id]); lines.delete(`${sub}/${id}`); },
};
const app = createApp(fakes);
const auth = { "x-user-token": "dev" };
before(() => {
  process.env.NODE_ENV = "development";
  process.env.DEV_SESSION = "me@example.com";
});

test("every route is 401 without a bearer", async () => {
  for (const [method, path] of [["GET", "/cart"], ["PUT", "/cart/kbd"], ["DELETE", "/cart/kbd"]]) {
    const r = await app.request(path, { method });
    assert.equal(r.status, 401, `${method} ${path}`);
  }
});

test("PUT adds a line that GET returns", async () => {
  assert.equal((await app.request("/cart/kbd", { method: "PUT", headers: auth })).status, 204);
  const r = await app.request("/cart", { headers: auth });
  assert.equal(r.headers.get("x-vertical"), "cart-api");
  assert.equal(r.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await r.json(), { lines: [{ productId: "kbd", qty: 1 }] });
});

test("DELETE removes the line", async () => {
  assert.equal((await app.request("/cart/kbd", { method: "DELETE", headers: auth })).status, 204);
  assert.deepEqual(await (await app.request("/cart", { headers: auth })).json(), { lines: [] });
});

test("a bad product id is 400 before the store is touched", async () => {
  const before = calls.length;
  const r = await app.request(`/cart/${"x".repeat(40)}`, { method: "PUT", headers: auth });
  assert.equal(r.status, 400);
  assert.deepEqual(await r.json(), { error: "bad product id" });
  assert.equal(calls.length, before);
});

test("x-flow-id is echoed when sent and minted when not", async () => {
  const sent = await app.request("/cart", { headers: { ...auth, "x-flow-id": "flow-7" } });
  assert.equal(sent.headers.get("x-flow-id"), "flow-7");
  const minted = await app.request("/cart");
  assert.match(minted.headers.get("x-flow-id"), /^[0-9a-f-]{36}$/);
});
