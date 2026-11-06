import { test } from "node:test";
import assert from "node:assert/strict";
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
