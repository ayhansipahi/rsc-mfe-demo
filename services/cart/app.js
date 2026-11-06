// The cart service: the bearer's cart lines. Internal: reached by the store app's server, which
// owns the catalog and validates product ids against it before calling here; this service only
// rejects ids that could not be a key.
import express from "express";
import { verifyBearer } from "./auth.js";

const PRODUCT_ID = /^[\w-]{1,32}$/;

export function createApp({ getLines, addLine, removeLine }) {
  const app = express();
  app.use(async (req, res, next) => {
    res.setHeader("x-vertical", "cart-api");
    res.setHeader("Cache-Control", "private, no-store");
    req.user = await verifyBearer(req);
    if (!req.user) return res.status(401).json({ error: "unauthorized" });
    next();
  });
  app.get("/cart", async (req, res) => {
    res.json({ lines: await getLines(req.user.sub) });
  });
  app.param("productId", (req, res, next, id) => {
    if (!PRODUCT_ID.test(id)) return res.status(400).json({ error: "bad product id" });
    next();
  });
  app.put("/cart/:productId", async (req, res) => {
    await addLine(req.user.sub, req.params.productId);
    res.status(204).end();
  });
  app.delete("/cart/:productId", async (req, res) => {
    await removeLine(req.user.sub, req.params.productId);
    res.status(204).end();
  });
  return app;
}
