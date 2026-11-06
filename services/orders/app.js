// The orders service: GET /orders for the bearer's user. Internal: reached by the orders app's
// server, not by browsers, so it sits outside CloudFront.
import { Hono } from "hono";
import { verifyBearer } from "./auth.js";

export function createApp({ listOrders }) {
  const app = new Hono();
  app.use(async (c, next) => {
    c.header("x-vertical", "orders-api");
    c.header("Cache-Control", "private, no-store");
    await next();
  });
  app.get("/orders", async (c) => {
    const user = await verifyBearer(c.req.header("authorization"));
    if (!user) return c.json({ error: "unauthorized" }, 401);
    return c.json(await listOrders(user.sub));
  });
  return app;
}
