import { test } from "node:test";
import assert from "node:assert/strict";
import { serviceHeaders } from "./service-fetch.server.ts";
import { getUser } from "./session.server.ts";

test("DEV_SESSION stubs the user outside production", async () => {
  process.env.NODE_ENV = "development";
  process.env.DEV_SESSION = "me@example.com";
  assert.deepEqual(await getUser(new Request("http://x/")), { sub: "dev", username: "me@example.com", token: "dev" });
});

test("DEV_SESSION is ignored in production", async () => {
  process.env.NODE_ENV = "production";
  process.env.DEV_SESSION = "me@example.com";
  assert.equal(await getUser(new Request("http://x/")), null);
});

test("getUser carries the request's x-flow-id so service calls can forward it", async () => {
  process.env.NODE_ENV = "development";
  process.env.DEV_SESSION = "me@example.com";
  const u = await getUser(new Request("http://x/", { headers: { "x-flow-id": "flow-9" } }));
  assert.equal(u?.flow, "flow-9");
  assert.deepEqual(serviceHeaders(u!), { "x-user-token": "dev", "x-flow-id": "flow-9" });
});

test("serviceHeaders without a flow id sends only the token", () => {
  assert.deepEqual(serviceHeaders({ sub: "s", username: "u", token: "t" }), { "x-user-token": "t" });
});
