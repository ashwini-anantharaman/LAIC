import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next's dev-server lock lives under distDir — a separate dir lets the
  // isolated Playwright server (port 3105, own data dir) run alongside the
  // dev server a human is using on :3000.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async redirects() {
    return [
      // The ladder became "Knowledge sets" (2026-07-17 UX rework). Temporary
      // redirect: an authed app with no SEO stake — a cached 308 would strand
      // browsers on /sets if the deploy were ever rolled back.
      {
        source: "/bridge/kb/:kbId/ladder",
        destination: "/bridge/kb/:kbId/sets",
        permanent: false,
      },
    ];
  },
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
    "@bridge/sayc-template",
    "@bridge/girkar-template",
    "@bridge/profiles",
    "@bridge/sessions",
    "@laic/learner-contracts",
    // The coaching engine, consumed as TypeScript source via `@laic/coach/core`
    // — the domain-free entrypoint, which by construction pulls no dependency
    // and no bridge code (Components/generalizable-coach/core.ts).
    "@laic/coach",
    "@laic/library-core",
    "@laic/library-ui",
    "@laic/kb-core",
  ],
  experimental: {
    serverActions: {
      // Document uploads run through a server action. Vercel serverless caps
      // request bodies at ~4.5 MB — we stop just under it and reject larger
      // files with a readable error in the action itself.
      bodySizeLimit: "4mb",
      // Dev behind a tunnel (phone testing): the Origin header carries the
      // tunnel hostname while Host is localhost — allow it or every form
      // posts "Invalid Server Actions request".
      allowedOrigins: ["*.trycloudflare.com"],
    },
  },
};

export default nextConfig;
