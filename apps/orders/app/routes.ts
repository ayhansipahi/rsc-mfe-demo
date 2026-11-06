import { type RouteConfig, route } from "@react-router/dev/routes";

// The orders team's routes. CloudFront sends /orders* here.
export default [route("orders", "routes/orders.tsx")] satisfies RouteConfig;
