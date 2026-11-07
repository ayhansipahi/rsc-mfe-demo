import { test } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { Hono } from "hono";
import { compress, requestLog } from "./node.server.js";

const gunzip = async (r) => zlib.gunzipSync(Buffer.from(await r.arrayBuffer())).toString();

test("requestLog: x-vertical, a minted x-flow-id, one JSON log line", async () => {
  const lines = [];
  const app = new Hono().use(requestLog("orders-web", (l) => lines.push(l))).get("/x", (c) => c.text("ok"));
  const r = await app.request("/x");
  assert.equal(r.headers.get("x-vertical"), "orders-web");
  assert.match(r.headers.get("x-flow-id"), /^[0-9a-f-]{36}$/);
  assert.equal(lines.length, 1);
  const log = JSON.parse(lines[0]);
  assert.equal(log.flow, r.headers.get("x-flow-id"));
  assert.deepEqual([log.vertical, log.method, log.path, log.status], ["orders-web", "GET", "/x", 200]);
  assert.equal(typeof log.ms, "number");
});

test("requestLog: an incoming x-flow-id is kept and passed on to the handler", async () => {
  const app = new Hono().use(requestLog("orders-web", () => {})).get("/x", (c) => c.text(c.req.header("x-flow-id")));
  const r = await app.request("/x", { headers: { "x-flow-id": "flow-1" } });
  assert.equal(r.headers.get("x-flow-id"), "flow-1");
  assert.equal(await r.text(), "flow-1");
});

test("compress: gzips text when asked, leaves it alone otherwise", async () => {
  const app = new Hono().use(compress()).get("/t", (c) => c.text("hello ".repeat(50)));
  const z = await app.request("/t", { headers: { "accept-encoding": "gzip" } });
  assert.equal(z.headers.get("content-encoding"), "gzip");
  assert.equal(z.headers.get("vary"), "accept-encoding");
  assert.equal(await gunzip(z), "hello ".repeat(50));
  const plain = await app.request("/t");
  assert.equal(plain.headers.get("content-encoding"), null);
  assert.equal(await plain.text(), "hello ".repeat(50));
});

test("compress: each streamed chunk is flushed, not held until the end", async () => {
  let release;
  const gate = new Promise((ok) => (release = ok));
  const app = new Hono().use(compress()).get("/s", (c) => {
    const body = new ReadableStream({
      async start(ctrl) { ctrl.enqueue(new TextEncoder().encode("first ".repeat(20))); await gate; ctrl.enqueue(new TextEncoder().encode("second")); ctrl.close(); },
    });
    return c.body(body, 200, { "content-type": "text/html" });
  });
  const r = await app.request("/s", { headers: { "accept-encoding": "gzip" } });
  const reader = r.body.getReader();
  const first = await reader.read(); // must arrive while the handler is still waiting on the gate
  assert.ok(first.value?.length > 0, "a compressed chunk arrived before the stream ended");
  release();
  let rest = Buffer.from(first.value);
  for (let n = await reader.read(); !n.done; n = await reader.read()) rest = Buffer.concat([rest, n.value]);
  assert.equal(zlib.gunzipSync(rest).toString(), "first ".repeat(20) + "second");
});

test("compress: images are not compressed", async () => {
  const app = new Hono().use(compress()).get("/i", (c) => c.body(new Uint8Array(100), 200, { "content-type": "image/png" }));
  const r = await app.request("/i", { headers: { "accept-encoding": "gzip" } });
  assert.equal(r.headers.get("content-encoding"), null);
});
