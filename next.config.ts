import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Kept deliberately simple: every page is rendered per-request with the
  // signed-in user's session. Cache Components can be turned on later.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
