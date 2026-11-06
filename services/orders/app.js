// The orders service: GET /orders for the bearer's user. Internal: reached by the orders app's
// server, not by browsers, so it sits outside CloudFront.
import express from "express";
import { verifyBearer } from "./auth.js";

export function createApp({ listOrders }) {
  const app = express();
  app.use((_req, res, next) => {
    res.setHeader("x-vertical", "orders-api");
    res.setHeader("Cache-Control", "private, no-store");
    next();
  });
  app.get("/orders", async (req, res) => {
    const user = await verifyBearer(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    res.json(await listOrders(user.sub));
  });
  return app;
}
