import { unstable_reactRouterRSC as reactRouterRSC } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import rsc from "@vitejs/plugin-rsc";
import { defineConfig } from "vite";

// This app's assets must reach the function that built them: the build mounts under
// /store-static/, which the /orders* CloudFront behavior covers. The dev server is this app
// alone on its own port, so it serves from /.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/store-static/" : "/",
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16) + "Z") },
  plugins: [tailwindcss(), reactRouterRSC(), rsc()],
  // The shell package is TypeScript source: bundle it rather than loading it at runtime.
  ssr: { noExternal: ["@rsc-mfe/shell"] },
}));
