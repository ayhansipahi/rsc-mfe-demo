import type { Config } from "@react-router/dev/config";

export default {
  // "/" is no longer prerendered: the root loader picks the chrome per request (see root.tsx).
} satisfies Config;
