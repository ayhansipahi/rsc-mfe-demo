import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { serviceFetch, serviceHeaders } from "./service-fetch.server.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.DEV_SESSION;
});

function capture() {
  const seen: { url: string; headers: Record<string, string> }[] = [];
  globalThis.fetch = (async (url: string, init: { headers: Record<string, string> }) => {
    seen.push({ url, headers: init.headers });
    return new Response("{}");
  }) as unknown as typeof fetch;
  return seen;
}

test("the user's token and flow id go in x-user-token and x-flow-id, never Authorization", () => {
  assert.deepEqual(serviceHeaders({ token: "t", flow: "f" }), { "x-user-token": "t", "x-flow-id": "f" });
  assert.deepEqual(serviceHeaders({ token: "t" }), { "x-user-token": "t" });
});

test("a deployed service call is SigV4-signed for the lambda service, with the token in its own header", async () => {
  process.env.AWS_REGION = "eu-central-1";
  process.env.AWS_ACCESS_KEY_ID = "AKIDEXAMPLE";
  process.env.AWS_SECRET_ACCESS_KEY = "secret";
  process.env.AWS_SESSION_TOKEN = "session";
  const seen = capture();
  await serviceFetch("https://abc.lambda-web.eu-central-1.on.aws/cart/kbd", { method: "PUT" }, { token: "t", flow: "f" });
  const h = Object.fromEntries(Object.entries(seen[0].headers).map(([k, v]) => [k.toLowerCase(), v]));
  assert.match(h.authorization, /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/eu-central-1\/lambda\/aws4_request, SignedHeaders=.*host.*x-amz-content-sha256.*, Signature=[0-9a-f]{64}$/);
  assert.equal(h["x-amz-content-sha256"], "UNSIGNED-PAYLOAD");
  assert.equal(h["x-amz-security-token"], "session");
  assert.equal(h["x-user-token"], "t");
  assert.equal(h["x-flow-id"], "f");
});

test("localhost and DEV_SESSION calls are unsigned", async () => {
  const seen = capture();
  await serviceFetch("http://localhost:4001/orders", {}, { token: "dev" });
  process.env.DEV_SESSION = "me@example.com";
  await serviceFetch("https://abc.lambda-web.eu-central-1.on.aws/orders", {}, { token: "dev" });
  for (const s of seen) {
    assert.equal(s.headers.authorization, undefined);
    assert.equal(s.headers["x-user-token"], "dev");
  }
});
