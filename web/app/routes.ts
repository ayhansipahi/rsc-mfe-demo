import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.ts"),
  route("orders", "routes/orders.tsx"),
  // Resource route (no component): the passkey ceremony's server half.
  route("auth/passkey", "routes/auth.passkey.ts"),
] satisfies RouteConfig;
