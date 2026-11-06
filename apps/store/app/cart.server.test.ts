import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { addLine, getCart } from "./cart.server.ts";

const seen: { method?: string; url?: string; auth?: string }[] = [];
const server = http.createServer((req, res) => {
  seen.push({ method: req.method, url: req.url, auth: req.headers.authorization });
  if (req.method === "GET") {
    res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify({ lines: [{ productId: "kbd", qty: 2 }, { productId: "zzz", qty: 1 }] }));
  }
  res.statusCode = 204;
  res.end();
});

test("getCart joins the service's lines with the catalog and drops unknown ids", async () => {
  await new Promise<void>((ok) => server.listen(0, ok));
  process.env.CART_API_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    assert.deepEqual(await getCart({ token: "t" }), [{ productId: "kbd", name: "Mechanical keyboard", price: 89, qty: 2 }]);
    await addLine({ token: "t" }, "kbd");
    assert.deepEqual(seen.map((s) => `${s.method} ${s.url} ${s.auth}`), ["GET /cart Bearer t", "PUT /cart/kbd Bearer t"]);
  } finally {
    server.close();
  }
});
