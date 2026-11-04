import { unstable_reactRouterRSC as reactRouterRSC } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import rsc from "@vitejs/plugin-rsc";
import { defineConfig } from "vite";

// Each vertical ships its own client bundle. Assets must reach the function that built them, so
// the orders build mounts under /orders-static/, which the /orders* CloudFront behavior covers.
const base = process.env.VERTICAL === "orders" ? "/orders-static/" : "/";

export default defineConfig({
  base,
  plugins: [
    tailwindcss(),
    reactRouterRSC(),
    rsc(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
});
