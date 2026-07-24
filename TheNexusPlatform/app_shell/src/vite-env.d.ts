/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend API base URL — set in Vercel for deployed builds. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
