/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_DEV_LOGINS?: string;
  readonly VITE_LEARNING_PLATFORM_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
