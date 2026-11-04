import { type RouteConfig, index, route } from "@react-router/dev/routes";

// One source tree, built once per vertical. VERTICAL selects the route set at build time:
// "account" owns the home page and everything auth, "orders" owns /orders. CloudFront sends
// /orders* to the orders function and the rest to the account function; unset builds everything.
const account = [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.ts"),
  // Resource route (no component): the passkey ceremony's server half.
  route("auth/passkey", "routes/auth.passkey.ts"),
];
const orders = [route("orders", "routes/orders.tsx")];
const vertical = process.env.VERTICAL;

export default (vertical === "orders" ? orders : vertical === "account" ? account : [...account, ...orders]) satisfies RouteConfig;
