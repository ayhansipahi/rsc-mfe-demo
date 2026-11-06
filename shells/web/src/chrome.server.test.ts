import { test } from "node:test";
import assert from "node:assert/strict";
import { chrome } from "./chrome.server.ts";

const user = { username: "me@example.com", token: "t" } as any;
const req = (cookie?: string) =>
  new Request("https://rscmfe.sph.sh/orders", { headers: cookie ? { cookie } : {} });

test("signed out: no email, no cart, and the store is not asked", async () => {
  let fetched = false;
  const r = await chrome(req(), { getUser: async () => null, fetch: async () => ((fetched = true), new Response()) });
  assert.deepEqual(r, { email: null, cartCount: null });
  assert.equal(fetched, false);
});

test("signed in: email from the session, count from the store contract with the cookie forwarded", async () => {
  let seen: { url: string; cookie: string | null } | undefined;
  const fetch = async (url: URL | string, init?: RequestInit) => {
    seen = { url: String(url), cookie: new Headers(init?.headers).get("cookie") };
    return Response.json({ signedIn: true, count: 3, lines: [] });
  };
  const r = await chrome(req("session=abc"), { getUser: async () => user, fetch });
  assert.deepEqual(r, { email: "me@example.com", cartCount: 3 });
  assert.deepEqual(seen, { url: "https://rscmfe.sph.sh/store/api/cart", cookie: "session=abc" });
});

test("store down: email still, count left out", async () => {
  const r = await chrome(req("session=abc"), { getUser: async () => user, fetch: async () => { throw new Error("ECONNREFUSED"); } });
  assert.deepEqual(r, { email: "me@example.com", cartCount: null });
});
