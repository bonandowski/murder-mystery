import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // L'indicatore di sviluppo copre la barra delle tab in basso su mobile.
  devIndicators: false,
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
