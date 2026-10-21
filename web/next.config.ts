import type { NextConfig } from "next";

// A server app (route handlers proxy every external API so keys stay on the server). Deploy on Vercel or any Node host.
const nextConfig: NextConfig = {
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: "" },
  poweredByHeader: false,
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
