import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next's dev-server lock lives under distDir — a separate dir lets the
  // isolated Playwright server (port 3105, own data dir) run alongside the
  // dev server a human is using on :3000.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Workspace packages ship TypeScript source directly (internal-package
  // pattern); Next transpiles them.
  transpilePackages: [
    "@bridge/engine",
    "@bridge/events",
    "@bridge/config",
    "@bridge/formats",
    "@bridge/kb",
    "@bridge/nexus-client",
    "@bridge/pg-stores",
    "@bridge/profiles",
    "@bridge/sessions",
    "@laic/learner-contracts",
  ],
  experimental: {
    serverActions: {
      // Document uploads run through a server action. Vercel serverless caps
      // request bodies at ~4.5 MB — we stop just under it and reject larger
      // files with a readable error in the action itself.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
