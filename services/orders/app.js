// The orders service: GET /orders for the token's user. Internal: reached by the orders app's
// server, not by browsers. Its endpoint is IAM-only: only the orders app's role may invoke it.
import { Hono } from "hono";
import { verifyUserToken } from "./auth.js";

export function createApp({ listOrders }) {
  const app = new Hono();
  // The app's flow id (minted by its requestLog) comes in on x-flow-id; one log line per request
  // carries it, so a page and its service calls can be found together in CloudWatch.
  app.use(async (c, next) => {
    const flow = c.req.header("x-flow-id") ?? crypto.randomUUID();
    c.header("x-flow-id", flow);
    const t = performance.now();
    await next();
    console.log(JSON.stringify({ flow, vertical: "orders-api", method: c.req.method, path: new URL(c.req.url).pathname, status: c.res.status, ms: Math.round(performance.now() - t) }));
  });
  app.use(async (c, next) => {
    c.header("x-vertical", "orders-api");
    c.header("Cache-Control", "private, no-store");
    await next();
  });
  app.get("/orders", async (c) => {
    const user = await verifyUserToken(c.req.header("x-user-token"));
    if (!user) return c.json({ error: "unauthorized" }, 401);
    return c.json(await listOrders(user.sub));
  });
  return app;
}
