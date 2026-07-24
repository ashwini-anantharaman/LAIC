import type {
  WizardSource,
  SourceCollection,
  ClusteredKnowledgeBase,
  TutorialTemplate,
  TutorialSectionPlan,
  AssistantTurnRequest,
  AssistantMessage,
  ProposedEdit,
  MarkupFlag,
  VideoScriptContent,
} from './types';

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
  templateId?: string;
  /** Pass mark across all checks combined, e.g. "70%". */
  pass?: string;
  /** Whether progressive hints are generated / offered. */
  hintsOn?: boolean;
  /** Number of progressive hints per question. */
  hintN?: number;
  /** Allow AI to add helpful extras beyond the marked-up source. */
  aiExtra?: boolean;
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
  heading?: string;
  subheads?: string[];
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

/**
 * POST /api/tutorials/suggest-markup-flags — one document scan → compact
 * review list (core / confusion / diagram / out-of-scope) for Accept/Reject/Adjust.
 */
export function suggestTutorialMarkupFlags(
  sentences: { text: string; page?: number }[],
  opts?: { instruction?: string; objective?: string; title?: string },
  signal?: AbortSignal,
): Promise<{ flags: MarkupFlag[]; summary: string }> {
  return apiFetch<{ flags: MarkupFlag[]; summary: string }>('/api/tutorials/suggest-markup-flags', {
    method: 'POST',
    body: {
      sentences,
      instruction: opts?.instruction,
      objective: opts?.objective,
      title: opts?.title,
    },
    signal,
  }).then((r) => ({ flags: r.flags ?? [], summary: r.summary || '' }));
}

/** Timed caption chunk from YouTube ingest. */
export interface YtTranscriptSegment {
  id: string;
  start: number;
  end?: number;
  text: string;
}

/** POST /api/tutorials/ingest-youtube — server fetches the video transcript. */
export function ingestYoutube(
  url: string,
  signal?: AbortSignal,
): Promise<{ title: string; sentences: string[]; videoId?: string; segments?: YtTranscriptSegment[] }> {
  return apiFetch<{ title: string; sentences: string[]; videoId?: string; segments?: YtTranscriptSegment[] }>('/api/tutorials/ingest-youtube', {
    method: 'POST',
    body: { url },
    signal,
  });
}

/** POST /api/tutorials/ingest-web — server fetches a public web page as sentences. */
export function ingestWeb(
  url: string,
  signal?: AbortSignal,
): Promise<{ title: string; sentences: string[]; url?: string }> {
  return apiFetch<{ title: string; sentences: string[]; url?: string }>('/api/tutorials/ingest-web', {
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

/** POST /api/ai/edit-item — rewrite one quiz question or flashcard. */
export function editQuizQuestion(
  item: GeneratedQuizQuestion | Record<string, unknown>,
  instruction: string,
  signal?: AbortSignal,
): Promise<GeneratedQuizQuestion> {
  return apiFetch<{ item: GeneratedQuizQuestion }>('/api/ai/edit-item', {
    method: 'POST',
    body: { kind: 'quiz-question', item, instruction },
    signal,
  }).then((r) => r.item);
}

export function editFlashcard(
  item: { front: string; back: string; hook?: string; hint?: string; imageUrl?: string },
  instruction: string,
  signal?: AbortSignal,
): Promise<{ front: string; back: string; hook?: string; hint?: string; imageUrl?: string }> {
  return apiFetch<{ item: { front: string; back: string; hook?: string; hint?: string; imageUrl?: string } }>('/api/ai/edit-item', {
    method: 'POST',
    body: { kind: 'flashcard', item, instruction },
    signal,
  }).then((r) => r.item);
}

/**
 * POST /api/tutorials/extract-knowledge — classify, dedupe, and cluster
 * markup into a knowledge base for template-shaped generation.
 */
export async function buildTutorialKnowledgeBase(payload: {
  highlights?: { text: string; tag: string; from?: string; page?: number }[];
  extracts?: TutorialExtract[];
  shapeIntent?: string;
  objective?: string;
  topic?: string;
  refineWithLlm?: boolean;
}): Promise<{ knowledgeBase: ClusteredKnowledgeBase }> {
  return apiFetch('/api/tutorials/extract-knowledge', {
    method: 'POST',
    body: payload,
  });
}

/**
 * POST /api/tutorials/generate — streams the generated tutorial as typed
 * SSE events (`progress` | `part` | `done` | `error`). Prefer template +
 * sectionPlans + knowledgeBase; flat extracts remain a legacy fallback.
 */
export function generateTutorial(
  payload: {
    title: string;
    config: TutorialConfig;
    extracts?: TutorialExtract[];
    prompt?: string;
    /** Author-supplied media for the model to place inline (ref + caption only). */
    media?: { ref: string; kind: 'image' | 'video'; caption?: string }[];
    template?: TutorialTemplate | null;
    knowledgeBase?: ClusteredKnowledgeBase | null;
    sectionPlans?: TutorialSectionPlan[];
    shapeIntent?: string;
  },
  signal?: AbortSignal,
): AsyncGenerator<TutorialGenEvent, void, unknown> {
  return apiStream<TutorialGenEvent>('/api/tutorials/generate', {
    method: 'POST',
    body: payload,
    signal,
  });
}

/* ─── Concept cards ────────────────────────────────────────────── */

export interface ConceptCardConfig {
  concept?: string;
  aud?: string;
  lvl?: string;
  voi?: string;
  incl?: string | string[];
  analogy?: string;
  len?: string;
  /** Sheet categories from Define (toggle / rename / custom). */
  categories?: Array<{ id: string; label: string; enabled: boolean; builtin?: boolean; tone?: string }>;
}

export interface ConceptCardSourceUnit {
  text: string;
  from?: string;
  page?: number;
  kind?: string;
}

export interface GeneratedConceptCard {
  id: string;
  /** Legacy alias — prefer oneSentenceMeaning. */
  definition?: string;
  term: string;
  oneSentenceMeaning?: string;
  whyItMatters?: string;
  coreIdea?: string;
  keyComponents?: string[];
  example?: string;
  nonExample?: string;
  visualOrFormula?: string;
  visualChoice?: string;
  visualAlternative?: string;
  visualFormula?: string;
  commonMistake?: string;
  connection?: string;
  recallQuestion?: string;
  teachBack?: string;
  categories?: Array<{ id: string; label: string; enabled: boolean; builtin?: boolean; tone?: string }>;
  extraSections?: Array<{ id: string; title: string; body: string }>;
  analogy?: string;
  visualSuggestion?: string;
  misconception?: string;
  voice?: string;
  length?: string;
  includedViews?: Array<'definition' | 'analogy' | 'example' | 'visual' | 'misconception'>;
  citations?: Partial<Record<string, string>>;
}

export type ConceptCardGenEvent =
  | { type: 'progress'; message: string }
  | { type: 'card'; card: GeneratedConceptCard }
  | { type: 'done' }
  | { type: 'error'; code?: string; message: string };

/** POST /api/concept-cards/suggest-intents — Intent chips from marked-up units. */
export function suggestConceptIntents(
  payload: {
    title?: string;
    extracts?: TutorialExtract[];
    /** Use/Support highlights when extracts are empty. */
    markupUnits?: ConceptCardSourceUnit[];
    sourceUnits?: ConceptCardSourceUnit[];
    limit?: number;
  },
  signal?: AbortSignal,
): Promise<string[]> {
  return apiFetch<{ suggestions: string[] }>('/api/concept-cards/suggest-intents', {
    method: 'POST',
    body: payload,
    signal,
  }).then((r) => r.suggestions || []);
}

/** POST /api/concept-cards/generate — Intent retrieval + grounded views (SSE). */
export function generateConceptCard(
  payload: {
    title: string;
    config: ConceptCardConfig;
    extracts: TutorialExtract[];
    /** Use/Support highlights when extracts are empty. */
    markupUnits?: ConceptCardSourceUnit[];
    /** Full source — only used if nothing was marked up. */
    sourceUnits?: ConceptCardSourceUnit[];
    prompt?: string;
    knowledgeBase?: ClusteredKnowledgeBase | null;
    shapeIntent?: string;
  },
  signal?: AbortSignal,
): AsyncGenerator<ConceptCardGenEvent, void, unknown> {
  return apiStream<ConceptCardGenEvent>('/api/concept-cards/generate', {
    method: 'POST',
    body: payload,
    signal,
  });
}

export function editConceptCard(
  item: Omit<GeneratedConceptCard, 'id'> & { id?: string },
  instruction: string,
  signal?: AbortSignal,
): Promise<GeneratedConceptCard> {
  return apiFetch<{ item: GeneratedConceptCard }>('/api/ai/edit-item', {
    method: 'POST',
    body: { kind: 'concept-card', item, instruction },
    signal,
  }).then((r) => r.item);
}

/* ─── Summary / Reflection / Assignment / Drill ─────────────────── */

export type StructuredObjectKind = 'summary' | 'reflection' | 'assignment' | 'drill';

export type StructuredGenEvent<T> =
  | { type: 'progress'; message: string }
  | { type: 'result'; content: T }
  | { type: 'done' }
  | { type: 'error'; code?: string; message: string };

function structuredGeneratePath(kind: StructuredObjectKind): string {
  return ({
    summary: '/api/summaries/generate',
    reflection: '/api/reflections/generate',
    assignment: '/api/assignments/generate',
    drill: '/api/drills/generate',
  })[kind];
}

export function generateStructuredObject<T = Record<string, unknown>>(
  kind: StructuredObjectKind,
  payload: {
    title: string;
    config: Record<string, unknown>;
    extracts: TutorialExtract[];
    prompt?: string;
    knowledgeBase?: ClusteredKnowledgeBase | null;
    shapeIntent?: string;
  },
  signal?: AbortSignal,
): AsyncGenerator<StructuredGenEvent<T>, void, unknown> {
  return apiStream<StructuredGenEvent<T>>(structuredGeneratePath(kind), {
    method: 'POST',
    body: payload,
    signal,
  });
}

export function editStructuredObject<T = Record<string, unknown>>(
  kind: StructuredObjectKind,
  item: T,
  instruction: string,
  signal?: AbortSignal,
): Promise<T> {
  return apiFetch<{ item: T }>('/api/ai/edit-item', {
    method: 'POST',
    body: { kind, item, instruction },
    signal,
  }).then((r) => r.item);
}

/* ─── Quizzes ──────────────────────────────────────────────────── */

export interface QuizConfig {
  verify?: string;
  purpose?: string;
  concepts?: string;
  lvl?: string;
  qtypes?: string | string[];
  cog?: string | string[];
  diff?: string;
  wrong?: string;
  /** Yes / No from Define — adaptive difficulty while the learner takes the quiz. */
  adaptive?: string | boolean;
  nq?: number;
  pass?: string;
  show?: string;
  perq?: boolean;
}

export interface GeneratedQuizQuestion {
  id: string;
  question: string;
  type: 'multiple-choice' | 'true-false' | 'multi-select' | 'short-answer' | 'scenario';
  options?: string[];
  correct?: number;
  correctIndices?: number[];
  sampleAnswer?: string;
  explanation?: string;
  hint?: string;
  hints?: string[];
  cognitiveLevel?: string;
  difficulty?: string;
}

export type QuizGenEvent =
  | { type: 'progress'; message: string }
  | { type: 'question'; question: GeneratedQuizQuestion }
  | { type: 'done'; count?: number; passMark?: number; showExplanations?: string; adaptive?: boolean }
  | { type: 'error'; code?: string; message: string };

/**
 * POST /api/quizzes/generate — streams quiz questions as SSE events.
 * Generation is driven by Define (intent, purpose, concepts, level, qtypes, etc.).
 */
export function generateQuiz(
  payload: {
    title: string;
    config: QuizConfig;
    extracts: TutorialExtract[];
    prompt?: string;
    knowledgeBase?: ClusteredKnowledgeBase | null;
    shapeIntent?: string;
  },
  signal?: AbortSignal,
): AsyncGenerator<QuizGenEvent, void, unknown> {
  return apiStream<QuizGenEvent>('/api/quizzes/generate', {
    method: 'POST',
    body: payload,
    signal,
  });
}

/* ─── Flashcards ───────────────────────────────────────────────── */

export interface FlashcardConfig {
  mem?: string; aud?: string; lvl?: string;
  cc?: string | string[]; pull?: string | string[]; dir?: string;
  hooks?: boolean; nc?: number;
}

export interface GeneratedCard {
  id: string;
  front: string;
  back: string;
  hook?: string;
  hint?: string;
  /** Set by the model for Image → label — client resolves to a content-dev upload. */
  imageRef?: string;
  /** Author-uploaded image only (never AI-generated). */
  imageUrl?: string;
}

export type FlashcardGenEvent =
  | { type: 'progress'; message: string }
  | { type: 'card'; card: GeneratedCard }
  | { type: 'done'; count?: number }
  | { type: 'error'; code?: string; message: string };

/**
 * POST /api/flashcards/generate — streams a generated flashcard set as typed
 * SSE events (`progress` | `card` | `done` | `error`).
 * For Image → label, pass uploaded images with `url` so the server can run vision
 * and write the description side; the client attaches the same url by imageRef.
 */
export function generateFlashcards(
  payload: {
    title: string;
    config: FlashcardConfig;
    extracts: TutorialExtract[];
    prompt?: string;
    images?: { id: string; caption?: string; url: string }[];
    knowledgeBase?: ClusteredKnowledgeBase | null;
    shapeIntent?: string;
  },
  signal?: AbortSignal,
): AsyncGenerator<FlashcardGenEvent, void, unknown> {
  return apiStream<FlashcardGenEvent>('/api/flashcards/generate', {
    method: 'POST',
    body: payload,
    signal,
  });
}

/* ─── Video scripts (Edpuzzle-style) ───────────────────────────── */

export type VideoScriptGenEvent =
  | { type: 'progress'; message: string }
  | { type: 'result'; content: VideoScriptContent }
  | { type: 'done'; count?: number }
  | { type: 'error'; code?: string; message: string };

/** POST /api/video-scripts/generate — checkpoints + questions from transcript. */
export function generateVideoScript(
  payload: {
    title: string;
    config: Record<string, unknown>;
    extracts: TutorialExtract[];
    prompt?: string;
    videoUrl?: string;
    videoId?: string;
    videoTitle?: string;
    transcriptSegments?: YtTranscriptSegment[];
    knowledgeBase?: ClusteredKnowledgeBase | null;
    shapeIntent?: string;
  },
  signal?: AbortSignal,
): AsyncGenerator<VideoScriptGenEvent, void, unknown> {
  return apiStream<VideoScriptGenEvent>('/api/video-scripts/generate', {
    method: 'POST',
    body: payload,
    signal,
  });
}

/* ─── Ask AI (scoped to one learning object) ───────────────────── */

/**
 * POST /api/ask — answer a learner question using ONLY the provided
 * learning-object context text (never general knowledge outside it).
 */
export function askAboutObject(
  payload: {
    title: string;
    context: string;
    message: string;
    history?: { role: 'user' | 'assistant'; content: string }[];
  },
  signal?: AbortSignal,
): Promise<string> {
  return apiFetch<{ reply: string }>('/api/ask', {
    method: 'POST',
    body: payload,
    signal,
  }).then((r) => r.reply);
}

/** Video-script Ask AI — reply plus clickable source timestamps (seconds). */
export function askAboutVideo(
  payload: {
    title: string;
    context: string;
    message: string;
    currentTime?: number;
    history?: { role: 'user' | 'assistant'; content: string }[];
  },
  signal?: AbortSignal,
): Promise<{ reply: string; timestamps: number[] }> {
  return apiFetch<{ reply: string; timestamps?: number[] }>('/api/ask', {
    method: 'POST',
    body: { ...payload, videoAsk: true },
    signal,
  }).then((r) => ({
    reply: r.reply || '',
    timestamps: Array.isArray(r.timestamps)
      ? r.timestamps.map((t) => Number(t)).filter((t) => Number.isFinite(t) && t >= 0)
      : [],
  }));
}

/* ─── Course-dev Object Assistant ──────────────────────────────── */

export type AssistantTurnEvent =
  | { type: 'status'; message: string }
  | { type: 'token'; text: string }
  | { type: 'message'; message: AssistantMessage }
  | { type: 'proposal'; proposal: ProposedEdit }
  | { type: 'error'; code?: string; message: string }
  | { type: 'done' };

/**
 * POST /api/assistant/turn — SSE: status | token | message | proposal | error | done.
 * Grounded in AssistantContext; edits arrive only as proposals (never auto-applied).
 */
export function streamAssistantTurn(
  payload: AssistantTurnRequest,
  signal?: AbortSignal,
): AsyncGenerator<AssistantTurnEvent, void, unknown> {
  return apiStream<AssistantTurnEvent>('/api/assistant/turn', {
    method: 'POST',
    body: payload,
    signal,
  });
}
