import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyBearer } from "./auth.js";

const req = (authorization) => ({ headers: { authorization } });

test("Bearer dev is rejected in production", async () => {
  process.env.NODE_ENV = "production";
  process.env.DEV_SESSION = "me@example.com";
  assert.equal(await verifyBearer(req("Bearer dev")), null);
});

test("a token that is not a JWT is null, not a throw", async () => {
  process.env.NODE_ENV = "production";
  process.env.COGNITO_USER_POOL_ID = "eu-north-1_xxxxxxxxx";
  process.env.COGNITO_CLIENT_ID = "abc";
  assert.equal(await verifyBearer(req("Bearer not-a-jwt")), null);
});

test("no header is null", async () => {
  assert.equal(await verifyBearer(req(undefined)), null);
});

test("Bearer dev is rejected when NODE_ENV is unset (the deployed default)", async () => {
  delete process.env.NODE_ENV;
  process.env.DEV_SESSION = "me@example.com";
  assert.equal(await verifyBearer(req("Bearer dev")), null);
});
