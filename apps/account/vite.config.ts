import { unstable_reactRouterRSC as reactRouterRSC } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import rsc from "@vitejs/plugin-rsc";
import { defineConfig } from "vite";

// The account app answers the distribution's default behavior, so its assets live at /assets.
export default defineConfig(({ command }) => ({
  base: "/",
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16) + "Z") },
  plugins: [tailwindcss(), reactRouterRSC(), rsc()],
  // The shell package is TypeScript source: bundle it rather than loading it at runtime.
  ssr: { noExternal: ["@rsc-mfe/shell"] },
}));
