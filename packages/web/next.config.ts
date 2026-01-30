import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile the pipeline workspace package
  transpilePackages: ["@ilre/pipeline"],

  // Load .env from repo root
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
