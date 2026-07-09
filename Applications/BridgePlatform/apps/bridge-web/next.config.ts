import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source directly (internal-package
  // pattern); Next transpiles them.
  transpilePackages: [
    "@bridge/engine",
    "@bridge/events",
    "@bridge/config",
    "@bridge/formats",
    "@bridge/knowledge",
    "@bridge/dealer",
    "@bridge/evaluator",
    "@bridge/progress",
    "@bridge/nexus-client",
    "@bridge/sessions",
    "@laic/learner-contracts",
  ],
};

export default nextConfig;
