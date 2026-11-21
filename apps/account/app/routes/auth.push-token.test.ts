import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { action, db } from "./auth.push-token.ts";

const TOKEN = "ExponentPushToken[abc-123_XYZ]";
const call = (method: string, body: string) => action({ request: new Request("https://x.test/auth/push-token", { method, body }) });
const sent: Record<string, unknown>[] = [];
mock.method(db, "send", async (cmd: { input: Record<string, unknown> }) => (sent.push(cmd.input), {}));

test("a signed-in POST stores the token under the user's email; DELETE needs no session", async () => {
  process.env.DEV_SESSION = "a@example.com";
  assert.equal((await call("POST", TOKEN)).status, 204);
  delete process.env.DEV_SESSION;
  assert.equal((await call("DELETE", TOKEN)).status, 204);
  const key = { pk: { S: "device" }, token: { S: TOKEN } };
  assert.deepEqual(
    sent.splice(0).map((i) => i.Item ?? i.Key),
    [{ ...key, email: { S: "a@example.com" } }, key],
  );
});

test("no session, no token or another method: nothing is written", async () => {
  assert.equal((await call("POST", TOKEN)).status, 401);
  assert.equal((await call("POST", "<script>")).status, 400);
  assert.equal((await call("PUT", TOKEN)).status, 405);
  assert.equal(sent.length, 0);
});
