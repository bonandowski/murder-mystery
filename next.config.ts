import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // App interamente dinamica e realtime: niente Cache Components / prerender parziale.
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
