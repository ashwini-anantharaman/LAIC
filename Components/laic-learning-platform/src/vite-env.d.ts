/// <reference types="vite/client" />

declare module '*.md?raw' {
  const content: string;
  export default content;
}

declare module '*.json' {
  const value: unknown;
  export default value;
}

interface ImportMetaEnv {
  /** Base URL of the LAIC backend API, e.g. "http://localhost:8000". */
  /** Content Studio Node API */
  readonly VITE_API_BASE_URL?: string;
  /** Nexus platform API */
  readonly VITE_NEXUS_URL?: string;
  /** Supabase project URL, e.g. "https://xxxx.supabase.co". */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase anon/public key. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
