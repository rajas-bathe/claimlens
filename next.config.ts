import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  turbopack: {
    rules: {
      "globals.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    cpus: 1,
    workerThreads: false,
  },
  async rewrites() {
    return {
      fallback: [
        {
          source: "/:path*",
          destination: "/",
        },
      ],
    };
  },
};

export default nextConfig;
