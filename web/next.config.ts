import type { NextConfig } from "next";

// A server app (route handlers proxy every external API so keys stay on the server). Deploy on Vercel or any Node host.
const nextConfig: NextConfig = {
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: "" },
  poweredByHeader: false,
  agentRules: false, // don't generate AGENTS.md (instructions for AI coding agents) on `next dev`
  // `npm run dev` only: let phones and tablets on your own network open the app at http://<laptop's address>:3100.
  // Next blocks other devices by default, which leaves the page unclickable. Private network addresses only;
  // `npm start` has no such limit.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", ...Array.from({ length: 16 }, (_, i) => `172.${16 + i}.*.*`), "*.local"],
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
