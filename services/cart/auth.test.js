import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyUserToken } from "./auth.js";

const req = (authorization) => authorization;

test("the dev token is rejected in production", async () => {
  process.env.NODE_ENV = "production";
  process.env.DEV_SESSION = "me@example.com";
  assert.equal(await verifyUserToken(req("dev")), null);
});

test("a token that is not a JWT is null, not a throw", async () => {
  process.env.NODE_ENV = "production";
  process.env.COGNITO_USER_POOL_ID = "eu-north-1_xxxxxxxxx";
  process.env.COGNITO_CLIENT_ID = "abc";
  assert.equal(await verifyUserToken(req("not-a-jwt")), null);
});

test("no header is null", async () => {
  assert.equal(await verifyUserToken(req(undefined)), null);
});

test("the dev token is rejected when NODE_ENV is unset (the deployed default)", async () => {
  delete process.env.NODE_ENV;
  process.env.DEV_SESSION = "me@example.com";
  assert.equal(await verifyUserToken(req("dev")), null);
});
