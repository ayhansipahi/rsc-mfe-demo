// The cart service: the bearer's cart lines. Internal: reached by the store app's server (its endpoint is IAM-only: only the store app's role may invoke it), which
// owns the catalog and validates product ids against it before calling here; this service only
// rejects ids that could not be a key.
import { Hono } from "hono";
import { verifyUserToken } from "./auth.js";

const PRODUCT_ID = /^[\w-]{1,32}$/;

export function createApp({ getLines, addLine, removeLine }) {
  const app = new Hono();
  // The app's flow id (minted by its requestLog) comes in on x-flow-id; one log line per request
  // carries it, so a page and its service calls can be found together in CloudWatch.
  app.use(async (c, next) => {
    const flow = c.req.header("x-flow-id") ?? crypto.randomUUID();
    c.header("x-flow-id", flow);
    const t = performance.now();
    await next();
    console.log(JSON.stringify({ flow, vertical: "cart-api", method: c.req.method, path: new URL(c.req.url).pathname, status: c.res.status, ms: Math.round(performance.now() - t) }));
  });
  app.use(async (c, next) => {
    c.header("x-vertical", "cart-api");
    c.header("Cache-Control", "private, no-store");
    const user = await verifyUserToken(c.req.header("x-user-token"));
    if (!user) return c.json({ error: "unauthorized" }, 401);
    c.set("user", user);
    await next();
  });
  app.get("/cart", async (c) => c.json({ lines: await getLines(c.get("user").sub) }));
  app.use("/cart/:productId", async (c, next) => {
    if (!PRODUCT_ID.test(c.req.param("productId"))) return c.json({ error: "bad product id" }, 400);
    await next();
  });
  app.put("/cart/:productId", async (c) => {
    await addLine(c.get("user").sub, c.req.param("productId"));
    return c.body(null, 204);
  });
  app.delete("/cart/:productId", async (c) => {
    await removeLine(c.get("user").sub, c.req.param("productId"));
    return c.body(null, 204);
  });
  return app;
}
