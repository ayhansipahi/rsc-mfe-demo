import { type RouteConfig, index, route } from "@react-router/dev/routes";

// The account team's routes: the home page and everything auth. CloudFront's default behavior
// sends everything no other team claims here.
export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("signup", "routes/signup.tsx"),
  route("logout", "routes/logout.ts"),
  route("account", "routes/account.tsx"),
  route("privacy", "routes/privacy.tsx"),
  route("support", "routes/support.tsx"),
  // Resource routes (no component): the passkey ceremony's server half and the session contract.
  route("auth/passkey", "routes/auth.passkey.ts"),
  route("auth/me", "routes/auth.me.ts"),
] satisfies RouteConfig;
