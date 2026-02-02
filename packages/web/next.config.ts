import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile the pipeline workspace package
  transpilePackages: ["@ilre/pipeline"],

  // Standalone output for containerised deployments (Railway, Docker)
  output: "standalone",

  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
