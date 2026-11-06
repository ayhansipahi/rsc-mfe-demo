import { type RouteConfig, route } from "@react-router/dev/routes";

// The store team's routes. CloudFront sends /store* here.
export default [
  route("store", "routes/store.tsx"),
  route("store/cart", "routes/store.cart.tsx"),
  // Resource route: the cart contract the mini-cart fragment reads from any team's page.
  route("store/api/cart", "routes/store.api.cart.ts"),
  // Resource route: the mobile shell's camera photo, posted by the page, matched to the catalog.
  route("store/api/photo-search", "routes/store.api.photo-search.ts"),
] satisfies RouteConfig;
