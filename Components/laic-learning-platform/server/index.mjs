// LAIC dev backend (dependency-free Node HTTP server) on :8000.
//
// Serves two things:
//   1. Course-Wizard Step-1 source stubs (fake ingestion) — unchanged behavior.
//   2. REAL LLM-backed Tutorial endpoints (Anthropic):
//        POST /api/tutorials/suggest-highlights   → { suggestions: number[] }
//        POST /api/tutorials/generate  (SSE)       → progress/part/done events
//
// The LLM key lives here on the server, never in the browser.
// Run: `npm run server`  (loads .env via `node --env-file`).
//   Required: ANTHROPIC_API_KEY=sk-ant-...
//   Optional: LLM_MODEL (default claude-3-5-sonnet-latest), PORT (default 8000)

import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PYTHON = process.env.PYTHON || 'python3';

const PORT = process.env.PORT ? Number(process.env.PORT) : 8000;
const READY_AFTER_MS = 6000;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const LLM_MODEL = process.env.LLM_MODEL || 'claude-sonnet-5';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

/* ─── Course-Wizard Step 1 source stubs (unchanged) ───────────────── */

/** @type {Array<Record<string, any>>} */
let sources = [
  { id: 'src-1', title: 'How to Play Bridge', filename: 'how-to-play-bridge.pdf', kind: 'pdf', pages: 6, domain: 'ACBL Bridge Guide', primary: true, ingestionStatus: 'ready', collectionId: 'col-1' },
  { id: 'src-2', title: 'Bridge Basics — Video Transcript', filename: 'bridge-basics.vtt', kind: 'video-transcript', duration: '5 min', domain: 'Bridge Education Network', primary: false, ingestionStatus: 'processing' },
  { id: 'src-3', title: 'Scanned Rulebook (legacy)', filename: 'rulebook-scan.pdf', kind: 'pdf', pages: 42, domain: 'Legacy import', primary: false, ingestionStatus: 'failed', ingestionError: 'Text extraction failed — the file appears to be image-only.' },
];
const collections = [{ id: 'col-1', name: 'Bridge core', sourceIds: ['src-1'] }];

function scheduleReady(id) {
  setTimeout(() => {
    const s = sources.find((x) => x.id === id);
    if (s && s.ingestionStatus === 'processing') { s.ingestionStatus = 'ready'; delete s.ingestionError; }
  }, READY_AFTER_MS);
}
sources.filter((s) => s.ingestionStatus === 'processing').forEach((s) => scheduleReady(s.id));

let seq = 100;
const nextId = () => `src-${++seq}`;

/* ─── HTTP helpers ────────────────────────────────────────────────── */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...CORS });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

async function readJson(req) {
  const raw = (await readBody(req)).toString() || '{}';
  try { return JSON.parse(raw); } catch { return {}; }
}

/* ─── Anthropic call ──────────────────────────────────────────────── */

class LlmError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

async function callAnthropic({ system, user, maxTokens = 4096 }) {
  if (!ANTHROPIC_API_KEY) {
    throw new LlmError(400, 'no_api_key', 'No LLM key configured. Set ANTHROPIC_API_KEY in .env and restart the backend (npm run server).');
  }
  let res;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
  } catch (e) {
    throw new LlmError(502, 'llm_unreachable', `Could not reach the LLM provider: ${e.message}`);
  }

  const text = await res.text();
  if (!res.ok) {
    let msg = `LLM request failed (${res.status}).`;
    try { const j = JSON.parse(text); if (j?.error?.message) msg = j.error.message; } catch { /* ignore */ }
    throw new LlmError(res.status, 'llm_error', msg);
  }
  let data;
  try { data = JSON.parse(text); } catch { throw new LlmError(502, 'llm_bad_json', 'LLM returned malformed JSON envelope.'); }
  const out = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  if (!out) throw new LlmError(502, 'llm_empty', 'LLM returned an empty response.');
  return out;
}

/** Pull the first JSON value (array or object) out of a possibly fenced string. */
function extractJson(str) {
  let s = str.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const firstArr = s.indexOf('['); const firstObj = s.indexOf('{');
  const start = firstArr === -1 ? firstObj : firstObj === -1 ? firstArr : Math.min(firstArr, firstObj);
  const openChar = s[start];
  const closeChar = openChar === '[' ? ']' : '}';
  const end = s.lastIndexOf(closeChar);
  if (start === -1 || end === -1 || end < start) throw new LlmError(502, 'llm_parse', 'Could not find JSON in the LLM response.');
  return JSON.parse(s.slice(start, end + 1));
}

/* ─── Tutorial: YouTube transcript (via yt-dlp) ───────────────────── */

function parseVideoId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('/')[0];
    if (u.searchParams.get('v')) return u.searchParams.get('v');
    const m = u.pathname.match(/\/(shorts|embed|live)\/([^/?]+)/);
    if (m) return m[2];
  } catch { /* not a URL */ }
  const raw = String(url).match(/[a-zA-Z0-9_-]{11}/);
  return raw ? raw[0] : null;
}

/** Split text into sentences; fall back to word-chunks for caption text. */
function toSentences(text) {
  const norm = text.replace(/\s+/g, ' ').trim();
  if (!norm) return [];
  const raw = (norm.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) || [norm])
    .map((s) => s.trim())
    .filter((s) => s.replace(/[^A-Za-z0-9]/g, '').length >= 12);
  if (raw.length >= 3) return raw;
  // Poorly-punctuated (auto captions): chunk into ~22-word pseudo-sentences.
  const words = norm.split(' ');
  const chunks = [];
  for (let i = 0; i < words.length; i += 22) chunks.push(words.slice(i, i + 22).join(' '));
  return chunks.filter((c) => c.replace(/[^A-Za-z0-9]/g, '').length >= 12);
}

function execFileP(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, opts, (err, stdout, stderr) => {
      if (err) { err.stdout = stdout; err.stderr = stderr; reject(err); }
      else resolve({ stdout, stderr });
    });
  });
}

/** Parse yt-dlp json3 subtitle content into a single transcript string. */
function json3ToText(raw) {
  let data;
  try { data = JSON.parse(raw); } catch { return ''; }
  const parts = [];
  for (const ev of data.events || []) {
    for (const seg of ev.segs || []) if (seg.utf8) parts.push(seg.utf8);
  }
  return parts.join('').replace(/\s+/g, ' ').trim();
}

async function fetchYoutubeTranscript(url) {
  const id = parseVideoId(url);
  if (!id) throw new LlmError(400, 'bad_url', "That doesn't look like a YouTube link.");

  const dir = await mkdtemp(join(tmpdir(), 'laic_yt_'));
  try {
    let title = `YouTube video ${id}`;
    try {
      const { stdout } = await execFileP(PYTHON, [
        '-m', 'yt_dlp',
        '--skip-download', '--no-simulate', '--no-warnings',
        '--write-subs', '--write-auto-subs',
        '--sub-langs', 'en',
        '--sub-format', 'json3',
        '--print', 'title',
        '-o', join(dir, '%(id)s.%(ext)s'),
        `https://www.youtube.com/watch?v=${id}`,
      ], { timeout: 45000, maxBuffer: 1024 * 1024 * 8 });
      const t = String(stdout || '').trim().split('\n').filter(Boolean).pop();
      if (t) title = t;
    } catch (e) {
      const msg = String(e.stderr || e.message || '');
      if (/No module named yt_dlp|not found|ENOENT/i.test(msg)) {
        throw new LlmError(500, 'no_ytdlp', 'YouTube support needs yt-dlp on the server. Install it with: python3 -m pip install --user yt-dlp');
      }
      // yt-dlp exits non-zero on some sub errors even when a file was written; continue to check for output.
    }

    const files = (await readdir(dir)).filter((f) => f.endsWith('.json3'));
    if (files.length === 0) {
      throw new LlmError(422, 'no_captions', 'No English transcript is available for this video (captions may be disabled).');
    }
    const raw = await readFile(join(dir, files[0]), 'utf8');
    const transcript = json3ToText(raw);
    if (!transcript) throw new LlmError(422, 'empty_transcript', 'The transcript came back empty.');
    return { title, sentences: toSentences(transcript) };
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/* ─── Tutorial: suggest highlights ────────────────────────────────── */

async function suggestHighlights(sentences, instruction) {
  const numbered = sentences.map((s, i) => `[${i}] ${s}`).join('\n');
  const system = 'You help a course author mark up a source document. You pick the sentences most worth USING as the backbone of a tutorial: definitions, key facts, core mechanics, and load-bearing explanations. Skip filler, examples of little value, and redundant lines. Respond ONLY with a JSON array of integer sentence indices, nothing else.';
  const user = `${instruction ? `The author is looking for: ${instruction}\n\n` : ''}Here are the numbered sentences from the source:\n\n${numbered}\n\nReturn a JSON array of the indices to highlight for USE (roughly the ${Math.max(3, Math.round(sentences.length / 5))} most important). Example: [0, 3, 7]`;
  const raw = await callAnthropic({ system, user, maxTokens: 512 });
  const parsed = extractJson(raw);
  if (!Array.isArray(parsed)) throw new LlmError(502, 'llm_parse', 'Expected a JSON array of indices.');
  const valid = [...new Set(parsed.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0 && n < sentences.length))];
  valid.sort((a, b) => a - b);
  return valid;
}

/* ─── Tutorial: generate ──────────────────────────────────────────── */

function buildGeneratePrompt({ title, config, extracts, prompt, media }) {
  const c = config || {};
  const num = (v, d) => (typeof v === 'number' ? v : d);
  const secs = num(c.secs, 3);
  const chks = num(c.chks, 1);
  const excpts = num(c.excpts, 1);
  const wex = c.wex !== false;
  const end = c.end || 'Recap only';
  const hasExtracts = Array.isArray(extracts) && extracts.length > 0;
  const authorPrompt = prompt || (config && config.prompt) || '';
  const extractLines = hasExtracts
    ? extracts.map((e, i) => `(${i + 1}) [${e.kind || 'Key point'}] ${e.text}${e.from ? ` — ${e.from}` : ''}`).join('\n')
    : '(no content units — generate from the author\'s prompt/topic below)';

  const groundingRule = hasExtracts
    ? "Ground the content in the provided content units (the author's marked-up source). Prefer them; only add general connective explanation where needed."
    : "There are no marked-up source units. Generate from the author's prompt/topic below using your own knowledge, staying accurate and on-topic.";

  const mediaList = Array.isArray(media) ? media.filter((m) => m && m.ref) : [];
  const hasMedia = mediaList.length > 0;

  const system = [
    'You are an instructional designer generating a tutorial as STRUCTURED JSON.',
    groundingRule,
    'Output ONLY a JSON array of "part" objects. No prose, no markdown fences.',
    'Allowed part shapes:',
    '  {"type":"rich-text","label":string,"body":string}',
    '  {"type":"concept-card","label":string,"concept":string,"plain":string,"misc":string}',
    '  {"type":"question","label":string,"prompt":string,"options":[four strings],"correct":integer 0-3,"exp":string}',
    hasMedia ? '  {"type":"media","ref":string}   // place an author-supplied image or video clip' : '',
    hasMedia
      ? 'You are given author-supplied media (images and video clips). Place EACH media item with a {"type":"media","ref":"..."} part at the single most pedagogically relevant spot — right after the text it illustrates. Use each ref exactly once. Do NOT dump all media at the end, and do NOT invent refs.'
      : '',
  ].filter(Boolean).join('\n');

  const user = [
    `Tutorial title: ${title || '(untitled)'}`,
    `Learning objective: ${c.obj || '(none given)'}`,
    `Overall topic: ${c.topic || title || '(none given)'}`,
    `Audience: ${c.aud || 'High school'} (match tone and reading level to this)`,
    `Level: ${c.lvl || 'Basic'} (match reading level)`,
    `Progression: ${c.prog || 'Linear build-up'}`,
    `Depth per section: ${c.dpth || 'Standard'}`,
    authorPrompt ? `\nAuthor's prompt / description:\n${authorPrompt}` : '',
    '',
    'Content units to build from:',
    extractLines,
    hasMedia ? '\nAuthor-supplied media to place (use each ref exactly once, next to the most relevant text):' : '',
    hasMedia ? mediaList.map((m) => `  ref="${m.ref}" · ${m.kind === 'video' ? 'YouTube clip' : 'image'}${m.caption ? ` · caption: "${m.caption}"` : ''}`).join('\n') : '',
    '',
    'Produce, IN ORDER:',
    '1. One "rich-text" Introduction that states what the learner will be able to do.',
    `2. Exactly ${secs} sections. For EACH section: one "rich-text" explanation (label "Section N: <short title>")${wex ? ', then one "rich-text" worked example (label "Worked example")' : ''}${chks > 0 ? `, then ${chks} "question" knowledge-check(s) grounded in that section` : ''}.`,
    excpts > 0 && hasExtracts ? `3. ${excpts} "rich-text" part(s) labeled "Source excerpt" quoting the most relevant content unit(s) verbatim.` : '3. (no source excerpts)',
    end === 'End quiz' ? '4. End with 2-3 "question" parts as an end quiz.'
      : end === 'End assignment' ? '4. End with one "rich-text" assignment.'
      : end === 'Recap only' ? '4. End with one "rich-text" Recap.'
      : '4. (no closing part)',
    '',
    'Return the JSON array now.',
  ].join('\n');

  return { system, user };
}

const ALLOWED_TYPES = new Set(['rich-text', 'concept-card', 'question']);

function normalizePart(raw, idx) {
  if (!raw || typeof raw !== 'object') return null;
  const id = `g${Date.now()}_${idx}`;
  // Media placement placeholder — resolved to real media on the client by ref.
  if (raw.type === 'media') {
    return typeof raw.ref === 'string' && raw.ref ? { id, type: 'media', ref: raw.ref, label: 'Media' } : null;
  }
  if (!ALLOWED_TYPES.has(raw.type)) return null;
  const label = typeof raw.label === 'string' ? raw.label : '';
  if (raw.type === 'rich-text') {
    if (typeof raw.body !== 'string' || !raw.body.trim()) return null;
    return { id, type: 'rich-text', label, body: raw.body };
  }
  if (raw.type === 'concept-card') {
    return { id, type: 'concept-card', label, concept: String(raw.concept || ''), plain: String(raw.plain || ''), misc: String(raw.misc || '') };
  }
  // question
  const options = Array.isArray(raw.options) ? raw.options.slice(0, 4).map(String) : [];
  while (options.length < 4) options.push(`Option ${options.length + 1}`);
  let correct = Number(raw.correct);
  if (!Number.isInteger(correct) || correct < 0 || correct > 3) correct = 0;
  return { id, type: 'question', label, prompt: String(raw.prompt || ''), options, correct, exp: String(raw.exp || '') };
}

/* ─── Tutorial: edit a single block ───────────────────────────────── */

function shapeFor(type) {
  if (type === 'rich-text') return '{"type":"rich-text","label":string,"body":string}';
  if (type === 'concept-card') return '{"type":"concept-card","label":string,"concept":string,"plain":string,"misc":string}';
  return '{"type":"question","label":string,"prompt":string,"options":[four strings],"correct":integer 0-3,"exp":string}';
}

function buildEditPrompt(part, instruction) {
  const type = ALLOWED_TYPES.has(part.type) ? part.type : 'rich-text';
  const system = [
    'You are editing ONE block of a tutorial for a course author.',
    `Keep the block type exactly "${type}". Apply the author's instruction faithfully while keeping the content accurate.`,
    'Return ONLY the edited block as a single JSON object — no prose, no markdown code fences.',
    `Required shape: ${shapeFor(type)}`,
  ].join('\n');
  const user = [
    'Current block (JSON):',
    JSON.stringify(part, null, 2),
    '',
    `Instruction: ${instruction}`,
    '',
    'Return the edited block as a JSON object now.',
  ].join('\n');
  return { system, user };
}

/* ─── Flashcards: generate ────────────────────────────────────────── */

function buildFlashcardPrompt({ title, config, extracts, prompt }) {
  const c = config || {};
  const num = (v, d) => (typeof v === 'number' ? v : Number(v) || d);
  const nc = Math.max(3, Math.min(60, num(c.nc, 12)));
  const hooks = c.hooks === true;
  const hasExtracts = Array.isArray(extracts) && extracts.length > 0;
  const authorPrompt = prompt || '';
  const extractLines = hasExtracts
    ? extracts.map((e, i) => `(${i + 1}) [${e.kind || 'Key point'}] ${e.text}${e.from ? ` — ${e.from}` : ''}`).join('\n')
    : "(no marked-up units — build from the author's prompt/topic and your own knowledge)";

  const grounding = hasExtracts
    ? "Base the cards on the provided content units (the author's marked-up source). Prefer them."
    : "There are no marked-up units. Build accurate cards from the author's prompt/topic below.";

  const system = [
    'You generate a study FLASHCARD SET as STRUCTURED JSON.',
    grounding,
    'Output ONLY a JSON array of card objects. No prose, no markdown fences.',
    hooks
      ? 'Card shape: {"front":string,"back":string,"hook":string}  // hook = a short mnemonic / memory aid'
      : 'Card shape: {"front":string,"back":string}',
    'Front is the prompt (term/question/concept); back is the concise answer. Keep each side tight and self-contained.',
  ].join('\n');

  const user = [
    `Flashcard set title: ${title || '(untitled)'}`,
    `What to memorise: ${c.mem || title || '(none given)'}`,
    `Audience: ${c.aud || 'High school'} (match tone + reading level)`,
    `Level: ${c.lvl || 'Basic'} (match reading level)`,
    `Card content style: ${c.cc || 'Key terms → definitions'}`,
    `Pull cards from: ${c.pull || 'Glossary / key terms in source'}`,
    `Review direction: ${c.dir || 'Front→back'}`,
    hooks ? 'Include a short memory hook on every card.' : 'Do NOT include memory hooks.',
    authorPrompt ? `\nAuthor's prompt / description:\n${authorPrompt}` : '',
    '',
    'Content units to build from:',
    extractLines,
    '',
    `Produce EXACTLY ${nc} distinct, non-duplicate flashcards. Return the JSON array now.`,
  ].join('\n');

  return { system, user, nc };
}

function normalizeCard(raw, idx) {
  if (!raw || typeof raw !== 'object') return null;
  const front = String(raw.front || '').trim();
  const back = String(raw.back || '').trim();
  if (!front || !back) return null;
  const card = { id: `c${Date.now()}_${idx}`, front, back };
  if (typeof raw.hook === 'string' && raw.hook.trim()) card.hook = raw.hook.trim();
  return card;
}

/* ─── SSE helpers ─────────────────────────────────────────────────── */

function sseStart(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    ...CORS,
  });
}
function sseSend(res, obj) { res.write(`data: ${JSON.stringify(obj)}\n\n`); }
function sseDone(res) { res.write('data: [DONE]\n\n'); res.end(); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ─── Router ──────────────────────────────────────────────────────── */

const server = createServer(async (req, res) => {
  const { method } = req;
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  if (method === 'OPTIONS') return send(res, 204);
  console.log(`${method} ${path}`);

  /* ---- Course-Wizard Step 1 stubs ---- */
  if (method === 'GET' && path === '/api/sources') return send(res, 200, sources);
  if (method === 'GET' && path === '/api/collections') return send(res, 200, collections);

  const getOne = path.match(/^\/api\/sources\/([^/]+)$/);
  if (method === 'GET' && getOne) {
    const s = sources.find((x) => x.id === decodeURIComponent(getOne[1]));
    return s ? send(res, 200, s) : send(res, 404, { code: 'not_found', message: 'Source not found' });
  }

  if (method === 'POST' && path === '/api/sources') {
    const raw = await readBody(req);
    const ct = req.headers['content-type'] || '';
    let title = 'Untitled source', filename = 'untitled.txt', kind = 'text';
    if (ct.includes('application/json')) {
      try { const b = JSON.parse(raw.toString() || '{}'); if (b.name) { title = b.name; filename = b.name; } } catch { /* ignore */ }
    } else if (ct.includes('multipart/form-data')) {
      const m = raw.toString('latin1').match(/filename="([^"]+)"/);
      if (m && m[1]) {
        filename = m[1]; title = filename.replace(/\.[^.]+$/, '');
        const ext = (filename.split('.').pop() || '').toLowerCase();
        kind = ext === 'pdf' ? 'pdf' : ext === 'doc' || ext === 'docx' ? 'docx' : ext === 'ppt' || ext === 'pptx' ? 'slides' : 'text';
      }
    }
    const created = { id: nextId(), title, filename, kind, domain: 'Uploaded', primary: false, ingestionStatus: 'processing' };
    sources = [created, ...sources];
    scheduleReady(created.id);
    return send(res, 201, created);
  }

  const reingest = path.match(/^\/api\/sources\/([^/]+)\/reingest$/);
  if (method === 'POST' && reingest) {
    const s = sources.find((x) => x.id === decodeURIComponent(reingest[1]));
    if (!s) return send(res, 404, { code: 'not_found', message: 'Source not found' });
    s.ingestionStatus = 'processing'; delete s.ingestionError; scheduleReady(s.id);
    return send(res, 200, s);
  }

  /* ---- Tutorial: YouTube transcript ---- */
  if (method === 'POST' && path === '/api/tutorials/ingest-youtube') {
    const body = await readJson(req);
    if (!body.url) return send(res, 400, { code: 'no_url', message: 'Provide a YouTube URL.' });
    try {
      const out = await fetchYoutubeTranscript(body.url);
      return send(res, 200, out);
    } catch (e) {
      const status = e instanceof LlmError ? e.status : 500;
      return send(res, status, { code: e.code || 'error', message: e.message });
    }
  }

  /* ---- Tutorial: suggest highlights (real LLM) ---- */
  if (method === 'POST' && path === '/api/tutorials/suggest-highlights') {
    const body = await readJson(req);
    const sentences = Array.isArray(body.sentences) ? body.sentences.map(String) : [];
    if (sentences.length === 0) return send(res, 400, { code: 'no_sentences', message: 'No sentences to analyze.' });
    try {
      const suggestions = await suggestHighlights(sentences, body.instruction);
      return send(res, 200, { suggestions });
    } catch (e) {
      const status = e instanceof LlmError ? e.status : 500;
      return send(res, status, { code: e.code || 'error', message: e.message });
    }
  }

  /* ---- Tutorial: edit a single block (real LLM) ---- */
  if (method === 'POST' && path === '/api/tutorials/edit-block') {
    const body = await readJson(req);
    const part = body.part;
    const instruction = String(body.instruction || '').trim();
    if (!part || typeof part !== 'object') return send(res, 400, { code: 'no_block', message: 'Provide a block to edit.' });
    if (!instruction) return send(res, 400, { code: 'no_instruction', message: 'Tell the AI how to change the block.' });
    if (!ALLOWED_TYPES.has(part.type)) return send(res, 400, { code: 'bad_type', message: `Cannot AI-edit a "${part.type}" block.` });
    try {
      const { system, user } = buildEditPrompt(part, instruction);
      const raw = await callAnthropic({ system, user, maxTokens: 2048 });
      const parsed = extractJson(raw);
      const obj = Array.isArray(parsed) ? parsed[0] : parsed;
      const normalized = normalizePart({ ...obj, type: part.type }, 0);
      if (!normalized) throw new LlmError(502, 'llm_parse', 'The model did not return a usable block. Try rephrasing.');
      normalized.id = part.id; // keep the same block identity
      return send(res, 200, { part: normalized });
    } catch (e) {
      const status = e instanceof LlmError ? e.status : 500;
      return send(res, status, { code: e.code || 'error', message: e.message });
    }
  }

  /* ---- Flashcards: generate (real LLM, streamed as SSE) ---- */
  if (method === 'POST' && path === '/api/flashcards/generate') {
    const body = await readJson(req);
    sseStart(res);
    try {
      sseSend(res, { type: 'progress', message: 'Reading your source and settings…' });
      const { system, user } = buildFlashcardPrompt(body);
      sseSend(res, { type: 'progress', message: 'Writing the flashcards with the model…' });
      const raw = await callAnthropic({ system, user, maxTokens: 8192 });
      const parsed = extractJson(raw);
      const arr = Array.isArray(parsed) ? parsed : [];
      const cards = arr.map((c, i) => normalizeCard(c, i)).filter(Boolean);
      if (cards.length === 0) throw new LlmError(502, 'llm_no_cards', 'The model did not return any usable cards. Try again.');
      sseSend(res, { type: 'progress', message: `Assembling ${cards.length} cards…` });
      for (const card of cards) {
        sseSend(res, { type: 'card', card });
        await sleep(60);
      }
      sseSend(res, { type: 'done', count: cards.length });
    } catch (e) {
      sseSend(res, { type: 'error', code: e.code || 'error', message: e.message || 'Generation failed.' });
    }
    return sseDone(res);
  }

  /* ---- Tutorial: generate (real LLM, streamed as SSE) ---- */
  if (method === 'POST' && path === '/api/tutorials/generate') {
    const body = await readJson(req);
    sseStart(res);
    try {
      sseSend(res, { type: 'progress', message: 'Reading your extracts and settings…' });
      const { system, user } = buildGeneratePrompt(body);
      sseSend(res, { type: 'progress', message: 'Drafting the tutorial with the model…' });
      const raw = await callAnthropic({ system, user, maxTokens: 8192 });
      const parsed = extractJson(raw);
      const arr = Array.isArray(parsed) ? parsed : [];
      const parts = arr.map((p, i) => normalizePart(p, i)).filter(Boolean);
      if (parts.length === 0) throw new LlmError(502, 'llm_no_parts', 'The model did not return any usable parts. Try again.');
      sseSend(res, { type: 'progress', message: `Assembling ${parts.length} parts…` });
      for (const part of parts) {
        sseSend(res, { type: 'part', part });
        await sleep(120); // paced so the UI reveals parts progressively
      }
      sseSend(res, { type: 'done', count: parts.length });
    } catch (e) {
      sseSend(res, { type: 'error', code: e.code || 'error', message: e.message || 'Generation failed.' });
    }
    return sseDone(res);
  }

  return send(res, 404, { code: 'not_found', message: `No route for ${method} ${path}` });
});

server.listen(PORT, () => {
  console.log(`\nLAIC dev backend → http://localhost:${PORT}`);
  console.log(`LLM: ${ANTHROPIC_API_KEY ? `enabled (model ${LLM_MODEL})` : 'DISABLED — set ANTHROPIC_API_KEY in .env'}`);
  console.log('Tutorial: POST /api/tutorials/suggest-highlights · POST /api/tutorials/generate (SSE)');
  console.log('Sources stub: GET/POST /api/sources · GET /api/collections\n');
});
