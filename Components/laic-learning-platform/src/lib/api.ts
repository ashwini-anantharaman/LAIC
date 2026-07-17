import type { WizardSource, SourceCollection } from './types';

/* ────────────────────────────────────────────────────────────────
 * Typed API layer for the Course Wizard workflow.
 *
 * - Reads the backend base URL from VITE_API_BASE_URL. When unset, calls
 *   are made against a relative path (so a dev proxy can be used) and will
 *   fail loudly if nothing is listening — this workflow NEVER falls back to
 *   mock data.
 * - JSON requests go through `apiFetch`, streaming (SSE) through `apiStream`.
 * - All failures surface as a typed `ApiError`.
 * ──────────────────────────────────────────────────────────────── */

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/** Narrow a thrown value to a user-facing message. */
export function errorMessage(e: unknown, fallback = 'Something went wrong'): string {
  if (isApiError(e)) return e.message;
  if (e instanceof Error) return e.message;
  return fallback;
}

type Query = Record<string, string | number | boolean | undefined>;

interface RequestOpts {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  query?: Query;
  headers?: Record<string, string>;
}

function buildUrl(path: string, query?: Query): string {
  const base = `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return base;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) params.append(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

async function parseError(res: Response): Promise<ApiError> {
  let code = `http_${res.status}`;
  let message = res.statusText || `Request failed (${res.status})`;
  let details: unknown;
  try {
    const data = await res.json();
    details = data;
    if (data && typeof data === 'object') {
      if (typeof (data as any).code === 'string') code = (data as any).code;
      if (typeof (data as any).message === 'string') message = (data as any).message;
      else if (typeof (data as any).error === 'string') message = (data as any).error;
    }
  } catch {
    /* non-JSON error body — keep status text */
  }
  return new ApiError(res.status, code, message, details);
}

/** JSON request helper. Throws ApiError on non-2xx / network failure. */
export async function apiFetch<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const { method = 'GET', body, signal, query, headers = {} } = opts;

  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const init: RequestInit = { method, signal, headers: { ...headers } };

  if (body !== undefined) {
    if (isForm) {
      init.body = body as FormData; // let the browser set the multipart boundary
    } else {
      (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), init);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(
      0,
      'network_error',
      BASE_URL
        ? `Cannot reach the API at ${BASE_URL}. Is the backend running?`
        : 'Cannot reach the API. Set VITE_API_BASE_URL or start the backend.',
      e,
    );
  }

  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;

  const text = await res.text();
  if (!text) return undefined as T;

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    // Commonly happens when no backend is running and the dev server returns
    // its SPA index.html for /api/* — surface a clear, actionable message.
    throw new ApiError(
      res.status,
      'invalid_response',
      BASE_URL
        ? `Expected JSON from ${path} but the API returned a non-JSON response.`
        : `No API is serving ${path}. Set VITE_API_BASE_URL to your backend (requests are currently falling through to the dev server).`,
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(res.status, 'invalid_json', `The API returned malformed JSON from ${path}.`);
  }
}

/* ─── Streaming (SSE) ──────────────────────────────────────────── */

export interface StreamEvent {
  type: string;
  [key: string]: unknown;
}

/**
 * Consume a Server-Sent-Events response as a typed async iterator.
 * Parses standard `data:` frames (separated by a blank line); a `[DONE]`
 * sentinel ends the stream. Used by generate + edit-block in later steps.
 */
export async function* apiStream<E extends { type: string } = StreamEvent>(
  path: string,
  opts: RequestOpts = {},
): AsyncGenerator<E, void, unknown> {
  const { method = 'POST', body, signal, query, headers = {} } = opts;

  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      signal,
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(0, 'network_error', 'Cannot reach the API stream. Is the backend running?', e);
  }

  if (!res.ok) throw await parseError(res);
  if (!res.body) throw new ApiError(0, 'no_stream_body', 'The server returned no stream body.');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);

        const data = frame
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');

        if (!data) continue;
        if (data === '[DONE]') return;
        try {
          yield JSON.parse(data) as E;
        } catch {
          /* ignore keep-alive / non-JSON frames */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/* ════════════════════════════════════════════════════════════════
 * STEP 1 — Sources
 * ════════════════════════════════════════════════════════════════ */

/** GET /api/sources — the author's reusable Source Library. */
export function getSources(signal?: AbortSignal): Promise<WizardSource[]> {
  return apiFetch<WizardSource[]>('/api/sources', { signal });
}

/** GET /api/collections — named groupings of sources. */
export function getSourceCollections(signal?: AbortSignal): Promise<SourceCollection[]> {
  return apiFetch<SourceCollection[]>('/api/collections', { signal });
}

/** GET /api/sources/:id — used to poll ingestion status while processing. */
export function getSource(id: string, signal?: AbortSignal): Promise<WizardSource> {
  return apiFetch<WizardSource>(`/api/sources/${encodeURIComponent(id)}`, { signal });
}

/** POST /api/sources (multipart) — upload a file and kick off ingestion. */
export function uploadSource(
  file: File,
  opts: { collectionId?: string; signal?: AbortSignal } = {},
): Promise<WizardSource> {
  const form = new FormData();
  form.append('file', file);
  if (opts.collectionId) form.append('collectionId', opts.collectionId);
  return apiFetch<WizardSource>('/api/sources', { method: 'POST', body: form, signal: opts.signal });
}

/** POST /api/sources — create a named (placeholder) source and kick off ingestion. */
export function createNamedSource(name: string, signal?: AbortSignal): Promise<WizardSource> {
  return apiFetch<WizardSource>('/api/sources', { method: 'POST', body: { name }, signal });
}

/** POST /api/sources/:id/reingest — retry a failed ingestion. */
export function reingestSource(id: string, signal?: AbortSignal): Promise<WizardSource> {
  return apiFetch<WizardSource>(`/api/sources/${encodeURIComponent(id)}/reingest`, {
    method: 'POST',
    signal,
  });
}

/* ════════════════════════════════════════════════════════════════
 * Tutorial workflow — real LLM (server-side; key stays on backend)
 * ════════════════════════════════════════════════════════════════ */

export interface TutorialConfig {
  obj?: string; topic?: string; aud?: string; lvl?: string;
  secs?: number; prog?: string; dpth?: string; end?: string;
  chks?: number; excpts?: number; wex?: boolean;
}

export interface TutorialExtract {
  kind?: string;
  text: string;
  from?: string;
}

/** Any editor-renderable part produced by generation. */
export interface GeneratedPart {
  id: string;
  type: 'rich-text' | 'concept-card' | 'question' | 'media';
  label: string;
  body?: string;
  concept?: string;
  plain?: string;
  misc?: string;
  prompt?: string;
  options?: string[];
  correct?: number;
  exp?: string;
  /** For a `media` placeholder — references author-supplied media by id. */
  ref?: string;
}

export type TutorialGenEvent =
  | { type: 'progress'; message: string }
  | { type: 'part'; part: GeneratedPart }
  | { type: 'done'; count?: number }
  | { type: 'error'; code?: string; message: string };

/**
 * POST /api/tutorials/suggest-highlights — the model picks which sentence
 * indices are most worth USING for the tutorial. Returns the indices.
 */
export function suggestTutorialHighlights(
  sentences: string[],
  instruction?: string,
  signal?: AbortSignal,
): Promise<number[]> {
  return apiFetch<{ suggestions: number[] }>('/api/tutorials/suggest-highlights', {
    method: 'POST',
    body: { sentences, instruction },
    signal,
  }).then((r) => r.suggestions ?? []);
}

/** POST /api/tutorials/ingest-youtube — server fetches the video transcript. */
export function ingestYoutube(
  url: string,
  signal?: AbortSignal,
): Promise<{ title: string; sentences: string[] }> {
  return apiFetch<{ title: string; sentences: string[] }>('/api/tutorials/ingest-youtube', {
    method: 'POST',
    body: { url },
    signal,
  });
}

/**
 * POST /api/tutorials/edit-block — the model rewrites a single block per the
 * author's instruction, returning the edited block of the SAME type/id.
 */
export function editTutorialBlock(
  part: GeneratedPart,
  instruction: string,
  signal?: AbortSignal,
): Promise<GeneratedPart> {
  return apiFetch<{ part: GeneratedPart }>('/api/tutorials/edit-block', {
    method: 'POST',
    body: { part, instruction },
    signal,
  }).then((r) => r.part);
}

/**
 * POST /api/tutorials/generate — streams the generated tutorial as typed
 * SSE events (`progress` | `part` | `done` | `error`). `prompt` grounds
 * generation when there is no marked-up source (the "no source" path).
 */
export function generateTutorial(
  payload: {
    title: string;
    config: TutorialConfig;
    extracts: TutorialExtract[];
    prompt?: string;
    /** Author-supplied media for the model to place inline (ref + caption only). */
    media?: { ref: string; kind: 'image' | 'video'; caption?: string }[];
  },
  signal?: AbortSignal,
): AsyncGenerator<TutorialGenEvent, void, unknown> {
  return apiStream<TutorialGenEvent>('/api/tutorials/generate', {
    method: 'POST',
    body: payload,
    signal,
  });
}

/* ─── Flashcards ───────────────────────────────────────────────── */

export interface FlashcardConfig {
  mem?: string; aud?: string; lvl?: string;
  cc?: string; pull?: string; dir?: string;
  hooks?: boolean; nc?: number;
}

export interface GeneratedCard {
  id: string;
  front: string;
  back: string;
  hook?: string;
}

export type FlashcardGenEvent =
  | { type: 'progress'; message: string }
  | { type: 'card'; card: GeneratedCard }
  | { type: 'done'; count?: number }
  | { type: 'error'; code?: string; message: string };

/**
 * POST /api/flashcards/generate — streams a generated flashcard set as typed
 * SSE events (`progress` | `card` | `done` | `error`).
 */
export function generateFlashcards(
  payload: { title: string; config: FlashcardConfig; extracts: TutorialExtract[]; prompt?: string },
  signal?: AbortSignal,
): AsyncGenerator<FlashcardGenEvent, void, unknown> {
  return apiStream<FlashcardGenEvent>('/api/flashcards/generate', {
    method: 'POST',
    body: payload,
    signal,
  });
}
