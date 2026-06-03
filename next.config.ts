import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The chain + data layers are abstracted behind interfaces (src/chain, src/data),
  // so no external services are required to run the skeleton.
  //
  // Pin the workspace root to this project so an unrelated lockfile elsewhere
  // on the machine can't confuse Next's file-tracing.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
