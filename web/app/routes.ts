import { type RouteConfig, index, route } from "@react-router/dev/routes";

// One source tree, built once per vertical. VERTICAL selects the route set at build time:
// "account" owns the home page and everything auth, "orders" owns /orders, "store" owns /store.
// CloudFront sends /orders* and /store* to their functions and the rest to the account function;
// unset builds everything (local development).
const account = [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.ts"),
  route("account", "routes/account.tsx"),
  // Resource routes (no component): the passkey ceremony's server half and the session contract.
  route("auth/passkey", "routes/auth.passkey.ts"),
  route("auth/me", "routes/auth.me.ts"),
];
const orders = [route("orders", "routes/orders.tsx")];
const store = [
  route("store", "routes/store.tsx"),
  route("store/cart", "routes/store.cart.tsx"),
  // Resource route: the cart contract the mini-cart fragment reads from any vertical's page.
  route("store/api/cart", "routes/store.api.cart.ts"),
];
const verticals: Record<string, typeof account> = { account, orders, store };

export default (verticals[process.env.VERTICAL ?? ""] ?? [...account, ...orders, ...store]) satisfies RouteConfig;
