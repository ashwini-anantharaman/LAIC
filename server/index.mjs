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

/** `user` may be a string or a multimodal content-block array (for vision). */
async function callAnthropic({ system, user, maxTokens = 4096 }) {
  if (!ANTHROPIC_API_KEY) {
    throw new LlmError(400, 'no_api_key', 'No LLM key configured. Set ANTHROPIC_API_KEY in .env and restart the backend (npm run server).');
  }
  const content = typeof user === 'string' || Array.isArray(user) ? user : String(user ?? '');
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
        messages: [{ role: 'user', content }],
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

function fmtList(v, fallback) {
  if (Array.isArray(v) && v.length) return v.join('; ');
  if (typeof v === 'string' && v.trim()) return v;
  return fallback;
}

function cardStyles(config) {
  const cc = config?.cc;
  const list = Array.isArray(cc) ? cc : (cc ? [cc] : []);
  return list.map((s) => String(s));
}

function wantsImageCards(config) {
  return cardStyles(config).some((s) => /image\s*[→\-]\s*label/i.test(s));
}

function textCardStyles(config) {
  return cardStyles(config).filter((s) => !/image\s*[→\-]\s*label/i.test(s));
}

function extractLinesFrom(extracts) {
  if (!Array.isArray(extracts) || extracts.length === 0) return '(no marked-up PDF/source units provided)';
  return extracts.map((e, i) => `(${i + 1}) [${e.kind || 'Key point'}] ${e.text}${e.from ? ` — ${e.from}` : ''}`).join('\n');
}

/**
 * Text flashcards only (Key terms / Concept / Q→A).
 * Image → label is handled separately via vision on uploaded images.
 * Returns null when there are no text styles to generate.
 */
function buildFlashcardPrompt({ title, config, extracts, prompt }) {
  const c = config || {};
  const num = (v, d) => (typeof v === 'number' ? v : Number(v) || d);
  const styles = textCardStyles(c);
  // If only Image → label was selected, skip text generation.
  if (styles.length === 0) return null;

  const nc = Math.max(3, Math.min(60, num(c.nc, 12)));
  const hooks = c.hooks === true;
  const hasExtracts = Array.isArray(extracts) && extracts.length > 0;
  const authorPrompt = prompt || '';
  const extractLines = extractLinesFrom(extracts);

  const grounding = hasExtracts
    ? [
        'GROUNDING (required): Every card MUST be drawn from the content units below (author marked-up PDF/source) and the Define settings (What to memorise, Pull cards from, Audience, Level).',
        'Do NOT invent facts, terms, or questions that are not supported by those units or the Define fields. Paraphrase is fine; new material is not.',
      ].join(' ')
    : [
        'GROUNDING (required): There are no marked-up PDF units. Build ONLY from the Define settings and the author\'s prompt/description below.',
        'Do NOT invent unrelated topics. Stay inside What to memorise + Pull cards from + the prompt.',
      ].join(' ');

  const system = [
    'You generate a study FLASHCARD SET as STRUCTURED JSON.',
    grounding,
    'Output ONLY a JSON array of card objects. No prose, no markdown fences.',
    hooks
      ? 'Card shape: {"front":string,"back":string,"hook":string}  // hook = a short mnemonic / memory aid'
      : 'Card shape: {"front":string,"back":string}',
    'Front is the prompt (term/question/concept); back is the concise answer. Keep each side tight and self-contained.',
    `Use these Card content style(s): ${fmtList(styles, 'Key terms → definitions')}.`,
    'Do NOT create Image → label cards and do NOT include imageRef — images are handled separately.',
  ].join('\n');

  const user = [
    `Flashcard set title: ${title || '(untitled)'}`,
    '--- Define settings (follow these) ---',
    `What to memorise: ${c.mem || title || '(none given)'}`,
    `Audience: ${c.aud || 'High school'} (match tone + reading level)`,
    `Level: ${c.lvl || 'Basic'} (match reading level)`,
    `Card content style(s): ${fmtList(styles, 'Key terms → definitions')}`,
    `Pull cards from: ${fmtList(c.pull, 'Glossary / key terms in source')}`,
    `Review direction: ${c.dir || 'Front→back'}`,
    hooks ? 'Include a short memory hook on every card (still grounded in the source).' : 'Do NOT include memory hooks.',
    authorPrompt ? `\nAuthor's prompt / description:\n${authorPrompt}` : '',
    '',
    '--- Content units from the PDF / source (primary material) ---',
    extractLines,
    '',
    `Produce EXACTLY ${nc} distinct, non-duplicate flashcards. Return the JSON array now.`,
  ].join('\n');

  return { system, user, nc };
}

/** Turn a data URL or https URL into an Anthropic image source block. */
function toAnthropicImageSource(url) {
  const s = String(url || '').trim();
  const data = s.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/i);
  if (data) {
    return { type: 'base64', media_type: data[1].toLowerCase(), data: data[2] };
  }
  if (/^https?:\/\//i.test(s)) {
    return { type: 'url', url: s };
  }
  return null;
}

/**
 * Image → label: vision looks at the uploaded image and writes the quiz answer
 * (description/label) grounded in the PDF extracts + Define settings.
 */
async function buildImageLabelCard({ image, title, config, extracts, prompt }, idx) {
  const c = config || {};
  const hooks = c.hooks === true;
  const source = toAnthropicImageSource(image.url);
  if (!source) {
    throw new LlmError(400, 'bad_image', `Uploaded image "${image.id}" has no usable data URL or https URL for vision.`);
  }

  const system = [
    'You are writing the ANSWER side of an Image → label flashcard for students.',
    'You can SEE the author-uploaded image. The image itself is the prompt side of the card.',
    'Write a concise description / label of what is shown that quizzes the learner on the course material.',
    'GROUNDING: Relate what you see to the PDF/source units and Define settings below. Prefer terms and ideas from that material. Do not invent unrelated facts.',
    'If the author provided a caption, use it as a hint but verify against the image and the material.',
    'Output ONLY JSON. No prose, no markdown fences.',
    hooks
      ? 'Shape: {"back":string,"hook":string}  // back = the description/label; hook = optional short mnemonic'
      : 'Shape: {"back":string}',
    'Keep "back" to 1–3 tight sentences (or a short label + one clarifying clause). Study-friendly, not a long essay.',
  ].join('\n');

  const textPart = [
    `Flashcard set: ${title || '(untitled)'}`,
    `What to memorise: ${c.mem || title || '(none given)'}`,
    `Audience: ${c.aud || 'High school'}`,
    `Level: ${c.lvl || 'Basic'}`,
    `Pull cards from: ${fmtList(c.pull, 'Glossary / key terms in source')}`,
    image.caption ? `Author caption hint: ${image.caption}` : 'Author caption hint: (none)',
    '',
    '--- Content units from the PDF / source ---',
    extractLinesFrom(extracts),
    prompt ? `\nAuthor's prompt / description:\n${prompt}` : '',
    '',
    'Look at the image. Return JSON for the card back now.',
  ].join('\n');

  const raw = await callAnthropic({
    system,
    user: [
      { type: 'image', source },
      { type: 'text', text: textPart },
    ],
    maxTokens: 1024,
  });

  const parsed = extractJson(raw);
  const obj = Array.isArray(parsed) ? parsed[0] : parsed;
  const back = String(obj?.back || obj?.label || obj?.description || '').trim();
  if (!back) throw new LlmError(502, 'llm_parse', `Vision did not return a description for image ${image.id}.`);

  const card = {
    id: `c${Date.now()}_${idx}`,
    front: 'What is shown?',
    back,
    imageRef: image.id,
  };
  if (hooks && typeof obj?.hook === 'string' && obj.hook.trim()) card.hook = obj.hook.trim();
  return card;
}

function normalizeCard(raw, idx) {
  if (!raw || typeof raw !== 'object') return null;
  const front = String(raw.front || '').trim();
  const back = String(raw.back || '').trim();
  if (!front || !back) return null;
  // Text path never carries images
  if (raw.imageRef) return null;
  const card = { id: `c${Date.now()}_${idx}`, front, back };
  if (typeof raw.hook === 'string' && raw.hook.trim()) card.hook = raw.hook.trim();
  return card;
}

/* ─── Quizzes: generate ───────────────────────────────────────────── */

function parsePassMark(v) {
  const n = parseInt(String(v || '70').replace(/%/g, ''), 10);
  if (!Number.isFinite(n)) return 70;
  return Math.max(0, Math.min(100, n));
}

function mapQuizType(raw) {
  const t = String(raw || '').toLowerCase();
  if (t.includes('true')) return 'true-false';
  if (t.includes('multi-select') || t.includes('multi select')) return 'multi-select';
  if (t.includes('short')) return 'short-answer';
  if (t.includes('scenario')) return 'scenario';
  return 'multiple-choice';
}

function isAdaptiveQuiz(config) {
  const v = config?.adaptive;
  if (v === true) return true;
  return /^yes$/i.test(String(v || '').trim());
}

function buildQuizPrompt({ title, config, extracts, prompt }) {
  const c = config || {};
  const num = (v, d) => (typeof v === 'number' ? v : Number(v) || d);
  const nq = Math.max(3, Math.min(20, num(c.nq, 8)));
  const writeExplanations = c.perq !== false;
  const adaptive = isAdaptiveQuiz(c);
  const hasExtracts = Array.isArray(extracts) && extracts.length > 0;
  const authorPrompt = prompt || '';
  const extractLines = extractLinesFrom(extracts);

  const grounding = hasExtracts
    ? [
        'GROUNDING (required): Every question MUST assess ideas from the content units below (author marked-up PDF/source) and the Define settings.',
        'Do NOT invent facts outside that material. Distractors may be plausible misconceptions about the same material.',
      ].join(' ')
    : [
        'GROUNDING (required): No marked-up PDF units. Build ONLY from Define settings (intent/verify, purpose, concepts) and the author prompt.',
        'Stay inside those bounds — do not invent an unrelated subject.',
      ].join(' ');

  const adaptiveRules = adaptive
    ? [
        'ADAPTIVE QUIZ: Tag every question with difficulty "easy", "medium", or "hard".',
        'Build a balanced pool the runtime can branch through — roughly one-third easy, one-third medium, one-third hard (adjust for odd counts).',
        'Questions at the same difficulty should still vary in concept coverage so adapting stays meaningful.',
      ].join(' ')
    : 'FIXED QUIZ (not adaptive): Follow the Difficulty mix setting; difficulty tags are still helpful but order can be a normal set.';

  const system = [
    'You generate an assessment QUIZ as STRUCTURED JSON.',
    grounding,
    'Output ONLY a JSON array of question objects. No prose, no markdown fences.',
    'Question shape:',
    '{"question":string,"type":"multiple-choice"|"true-false"|"multi-select"|"short-answer"|"scenario","options":string[]|null,"correct":number|null,"correctIndices":number[]|null,"sampleAnswer":string|null,"explanation":string|null,"cognitiveLevel":string,"difficulty":"easy"|"medium"|"hard"}',
    'Rules:',
    '- multiple-choice / scenario: 4 options, correct = 0-based index of the right option.',
    '- true-false: options MUST be ["True","False"], correct = 0 or 1.',
    '- multi-select: 4 options, correctIndices = array of all correct 0-based indices (at least 2). Set correct to null.',
    '- short-answer: options null, correct null, sampleAnswer = a concise acceptable answer for grading guidance.',
    '- scenario: longer realistic stem grounded in the material, then 4 options like multiple-choice.',
    writeExplanations
      ? '- Write a clear per-question explanation for every item (why the right answer is right; briefly why common wrong answers fail).'
      : '- Set explanation to null/empty on every item — per-question explanations are OFF.',
    adaptiveRules,
    'Mix question types, cognitive levels, and difficulty according to Define. Wrong-answer style must match the Define setting.',
  ].join('\n');

  const user = [
    `Quiz title: ${title || '(untitled)'}`,
    '--- Define settings (generation MUST follow these) ---',
    `Intent / what it should verify: ${c.verify || '(none given)'}`,
    `Purpose: ${c.purpose || 'Formative check'}`,
    `Concepts to assess: ${c.concepts || '(none given)'}`,
    `Level: ${c.lvl || 'Basic'}`,
    `Question types: ${fmtList(c.qtypes, 'Multiple choice; True/false')} — mix across the set`,
    `Cognitive levels: ${fmtList(c.cog, 'Recall; Understand')} — distribute across the set`,
    `Difficulty mix: ${c.diff || 'Balanced'}`,
    `Wrong answers: ${c.wrong || 'Plausible common errors'}`,
    `Adaptive questions: ${adaptive ? 'YES — tag easy/medium/hard evenly for adaptive delivery' : 'NO — fixed question set'}`,
    `Scoring — pass mark: ${c.pass || '70%'} (metadata only; do not put this in question text)`,
    `Show explanations (learner UX): ${c.show || 'After attempt'} (metadata only)`,
    `Write per-question explanations: ${writeExplanations ? 'ON — include explanation on every question' : 'OFF — leave explanation empty'}`,
    authorPrompt ? `\nAuthor's prompt / description:\n${authorPrompt}` : '',
    '',
    '--- Content units from the PDF / source ---',
    extractLines,
    '',
    `Produce EXACTLY ${nq} distinct, non-duplicate questions. Return the JSON array now.`,
  ].join('\n');

  return { system, user, nq, adaptive };
}

function normalizeQuizQuestion(raw, idx, { writeExplanations } = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const question = String(raw.question || raw.stem || '').trim();
  if (!question) return null;
  const type = mapQuizType(raw.type);
  const out = {
    id: `q${Date.now()}_${idx}`,
    question,
    type,
  };

  if (typeof raw.cognitiveLevel === 'string' && raw.cognitiveLevel.trim()) {
    out.cognitiveLevel = raw.cognitiveLevel.trim();
  }
  if (typeof raw.difficulty === 'string' && raw.difficulty.trim()) {
    out.difficulty = raw.difficulty.trim().toLowerCase();
  }

  if (type === 'short-answer') {
    const sample = String(raw.sampleAnswer || raw.answer || raw.back || '').trim();
    if (!sample) return null;
    out.sampleAnswer = sample;
    out.options = [];
  } else if (type === 'true-false') {
    out.options = ['True', 'False'];
    const c = Number(raw.correct);
    out.correct = c === 1 ? 1 : 0;
  } else if (type === 'multi-select') {
    const options = Array.isArray(raw.options) ? raw.options.map((o) => String(o || '').trim()).filter(Boolean) : [];
    if (options.length < 3) return null;
    out.options = options;
    let indices = Array.isArray(raw.correctIndices)
      ? raw.correctIndices.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0 && n < options.length)
      : [];
    if (indices.length === 0 && Array.isArray(raw.correct)) {
      indices = raw.correct.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0 && n < options.length);
    }
    if (indices.length === 0 && Number.isInteger(Number(raw.correct))) {
      indices = [Number(raw.correct)];
    }
    indices = [...new Set(indices)].sort((a, b) => a - b);
    if (indices.length === 0) return null;
    out.correctIndices = indices;
  } else {
    // multiple-choice or scenario
    const options = Array.isArray(raw.options) ? raw.options.map((o) => String(o || '').trim()).filter(Boolean) : [];
    if (options.length < 2) return null;
    out.options = options;
    const c = Number(raw.correct);
    if (!Number.isInteger(c) || c < 0 || c >= options.length) return null;
    out.correct = c;
  }

  if (writeExplanations) {
    const exp = String(raw.explanation || raw.exp || '').trim();
    out.explanation = exp || 'See the source material for why this answer is correct.';
  } else {
    out.explanation = '';
  }
  if (typeof raw.hint === 'string' && raw.hint.trim()) out.hint = raw.hint.trim();

  return out;
}

/* ─── AI edit: quiz question or flashcard ─────────────────────────── */

/* ─── Concept cards: retrieval + grounded views ───────────────────── */

const CC_STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'by', 'as',
  'is', 'are', 'was', 'were', 'be', 'been', 'that', 'this', 'these', 'those', 'it',
  'its', 'at', 'from', 'into', 'about', 'vs', 'versus',
]);

const CC_VIEW_MAP = [
  { chip: 'formal definition', key: 'definition', label: 'Definition' },
  { chip: 'everyday analogy', key: 'analogy', label: 'Everyday analogy' },
  { chip: 'worked example', key: 'example', label: 'Worked example' },
  { chip: 'visual suggestion', key: 'visual', label: 'Visual suggestion' },
  { chip: 'common misconception', key: 'misconception', label: 'Common misconception' },
];

function tokenizeConceptQuery(q) {
  const raw = String(q || '').toLowerCase();
  // Keep parenthetical disambiguators: "Bridge (card game)" → bridge, card, game
  const cleaned = raw.replace(/[()[\]{},:;?!/\\|_+=*&^%$#@~`"']/g, ' ');
  return cleaned
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !CC_STOP.has(t));
}

/** Resolve Include chips → ordered view keys. Definition is always first (implicit spine). */
function resolveConceptViews(incl) {
  const list = Array.isArray(incl) ? incl : (incl ? [incl] : []);
  const selected = new Set(list.map((s) => String(s).trim().toLowerCase()));
  const views = ['definition']; // always — concept card spine
  for (const row of CC_VIEW_MAP) {
    if (row.key === 'definition') continue;
    if (selected.has(row.chip)) views.push(row.key);
  }
  return views;
}

function buildCorpusUnits({ extracts, sourceUnits, markupOnly = false }) {
  const out = [];
  const seen = new Set();
  const push = (text, from, kind) => {
    const t = String(text || '').trim();
    if (!t || t.length < 8) return;
    const key = t.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      id: `u${out.length + 1}`,
      text: t,
      from: from ? String(from) : '',
      kind: kind || 'Source',
    });
  };
  if (Array.isArray(extracts)) {
    for (const e of extracts) push(e?.text, e?.from, e?.kind || 'Extract');
  }
  // Concept cards: when markup/extracts exist, do NOT fall back to the whole PDF.
  if (!markupOnly && Array.isArray(sourceUnits)) {
    for (const u of sourceUnits) {
      const from = u?.from || (u?.page != null ? `p.${u.page}` : '');
      push(u?.text, from, u?.kind || 'Source');
    }
  }
  return out;
}

/** Marked-up units only (extracts, else highlight units passed as extracts-shaped sourceUnits). */
function buildConceptMarkupCorpus(body) {
  const extracts = Array.isArray(body?.extracts) ? body.extracts.filter((e) => String(e?.text || '').trim()) : [];
  const markupUnits = Array.isArray(body?.markupUnits) ? body.markupUnits.filter((e) => String(e?.text || '').trim()) : [];
  if (extracts.length) return buildCorpusUnits({ extracts, sourceUnits: [], markupOnly: true });
  if (markupUnits.length) return buildCorpusUnits({ extracts: markupUnits, sourceUnits: [], markupOnly: true });
  // Last resort: full source — only when nothing was marked up.
  return buildCorpusUnits({ extracts: [], sourceUnits: body?.sourceUnits, markupOnly: false });
}

function stripConceptParen(intent) {
  return String(intent || '').replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Intent → scored chunks from this object's source (keyword + phrase hybrid).
 * Returns { hits, bestScore, query } or throws LlmError(source_coverage).
 */
function retrieveConceptChunks(intent, corpus, { topK = 8, soft = false } = {}) {
  const query = String(intent || '').trim();
  if (!query) {
    if (soft) return null;
    throw new LlmError(400, 'missing_concept', 'Intent — the concept is required. Name the single idea this card should teach.');
  }
  if (!corpus.length) {
    if (soft) return null;
    throw new LlmError(
      400,
      'source_coverage',
      'Mark up your source and pull extracts first — concept cards are built only from what you marked.',
    );
  }

  const tokens = tokenizeConceptQuery(query);
  const phrase = query.toLowerCase().replace(/\s+/g, ' ').trim();
  const head = stripConceptParen(phrase).split(' ')[0] || tokens[0] || '';
  const paren = query.match(/\(([^)]+)\)/);
  const senseToks = paren ? tokenizeConceptQuery(paren[1]) : [];

  const scored = corpus.map((unit) => {
    const text = unit.text.toLowerCase();
    let score = 0;
    if (phrase.length >= 4 && text.includes(phrase)) score += 8;
    const bare = stripConceptParen(phrase);
    if (bare.length >= 3 && text.includes(bare)) score += 5;
    if (senseToks.length) {
      const senseHits = senseToks.filter((t) => text.includes(t)).length;
      // Soft bonus only — invented parentheticals must not sink a real head match.
      if (senseHits) score += senseHits * 1.5;
    }
    let hits = 0;
    for (const t of tokens) {
      if (text.includes(t)) {
        hits += 1;
        score += t === head ? 2.4 : 1.1;
      }
    }
    for (let i = 0; i < tokens.length - 1; i++) {
      const bi = `${tokens[i]} ${tokens[i + 1]}`;
      if (text.includes(bi)) score += 2.5;
    }
    if (head && text.includes(head)) score += 2;
    // Prefer extract/markup units over raw PDF dump.
    if (/extract|definition|key point|use|support|highlight/i.test(unit.kind || '')) score += 0.8;
    const dens = hits / Math.max(1, Math.sqrt(unit.text.length / 40));
    score += dens * 0.4;
    return { ...unit, score, hits };
  });

  scored.sort((a, b) => b.score - a.score);
  const bestScore = scored[0]?.score || 0;
  const bestHits = scored[0]?.hits || 0;
  const headCovered = head ? scored.some((u) => u.text.toLowerCase().includes(head) && u.score >= 2) : false;
  // Markup corpora are small — slightly lower bar than whole-PDF retrieval.
  const strongEnough = bestScore >= 2.8 && bestHits >= 1 && headCovered;

  if (!strongEnough) {
    if (soft) return null;
    throw new LlmError(
      422,
      'source_coverage',
      `“${query}” isn’t in your marked-up units — pick one of the suggested concepts from your markup.`,
    );
  }

  const floor = Math.max(1.8, bestScore * 0.3);
  const hits = scored.filter((u) => u.score >= floor).slice(0, topK);
  return { hits: hits.length ? hits : scored.slice(0, Math.min(3, scored.length)), bestScore, query };
}

/** Try intent, then bare form without parenthetical. */
function retrieveConceptChunksFlexible(intent, corpus, opts = {}) {
  const primary = retrieveConceptChunks(intent, corpus, { ...opts, soft: true });
  if (primary) return primary;
  const bare = stripConceptParen(intent);
  if (bare && bare.toLowerCase() !== String(intent || '').trim().toLowerCase()) {
    const second = retrieveConceptChunks(bare, corpus, { ...opts, soft: true });
    if (second) return { ...second, query: bare };
  }
  if (opts.soft) return null;
  return retrieveConceptChunks(intent, corpus, opts); // throw with message
}

function termAppearsInCorpus(term, corpus) {
  const head = stripConceptParen(term).toLowerCase();
  if (head.length < 2) return false;
  const blob = corpus.map((u) => u.text.toLowerCase()).join('\n');
  return blob.includes(head);
}

/** Suggest Intents that are covered by marked-up units (validated before return). */
async function suggestConceptIntents({ extracts, markupUnits, sourceUnits, title, limit = 8 }) {
  const corpus = buildConceptMarkupCorpus({ extracts, markupUnits, sourceUnits });
  if (!corpus.length) {
    throw new LlmError(
      400,
      'no_source',
      'Mark up your source and pull extracts first — Intent suggestions come from your markup, not the whole PDF.',
    );
  }

  const sample = corpus.slice(0, 40).map((u, i) => {
    const cite = u.from ? ` [${u.from}]` : '';
    return `(${i + 1})${cite} ${u.text.slice(0, 360)}`;
  }).join('\n');

  const n = Math.min(Math.max(Number(limit) || 8, 4), 12);
  const system = [
    'You help a course author pick ONE concept for a concept card.',
    'The excerpts are the AUTHOR\'S MARKED-UP units — the only allowed evidence.',
    'Propose distinct teachable concepts whose head term LITERALLY appears in those excerpts.',
    'Use a short label taken from the wording in the excerpts (e.g. "High-Card Points", "rubber", "trick").',
    'Do NOT invent parenthetical disambiguators unless those words also appear in the excerpts.',
    'Do NOT invent concepts, glossary senses, or domain tags outside the excerpts.',
    'Respond ONLY with a JSON array of strings. No prose, no markdown fences.',
  ].join(' ');

  const user = [
    title ? `Object title (optional hint): ${title}` : '',
    `Return up to ${n} concept Intent labels that appear in the marked-up units below.`,
    '',
    '--- Marked-up units (ONLY evidence) ---',
    sample,
    '',
    'Return a JSON array of strings now.',
  ].filter(Boolean).join('\n');

  const raw = await callAnthropic({ system, user, maxTokens: 1024 });
  const parsed = extractJson(raw);
  if (!Array.isArray(parsed)) throw new LlmError(502, 'llm_parse', 'Expected a JSON array of concept suggestions.');

  const candidates = [];
  const seen = new Set();
  const pushCand = (s) => {
    const t = String(s || '').trim().replace(/\s+/g, ' ');
    if (!t || t.length < 2 || t.length > 80) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(t);
  };
  for (const item of parsed) pushCand(item);
  // Also seed bare heads from Definition / Key point extracts.
  for (const u of corpus.slice(0, 20)) {
    const m = u.text.match(/^(.{2,48}?)(?:\s+is\s+|\s+are\s+|:\s+|—\s+)/i);
    if (m) pushCand(m[1].replace(/^[#*\-\d.\s]+/, ''));
  }

  const out = [];
  for (const c of candidates) {
    if (!termAppearsInCorpus(c, corpus)) continue;
    const hit = retrieveConceptChunksFlexible(c, corpus, { topK: 3, soft: true });
    if (!hit) continue;
    // Prefer the resolved query (may drop a bad parenthetical).
    const label = hit.query || c;
    const key = label.toLowerCase();
    if (out.some((x) => x.toLowerCase() === key)) continue;
    out.push(label);
    if (out.length >= n) break;
  }
  if (!out.length) {
    throw new LlmError(
      422,
      'no_concepts',
      'Couldn’t find clear concepts in your marked-up units. Pull more Use/Support highlights into Extract, then try again.',
    );
  }
  return out;
}

function formatRetrievedChunks(hits) {
  return hits.map((u, i) => {
    const cite = u.from ? ` [${u.from}]` : '';
    return `(${i + 1}) id=${u.id}${cite}\n${u.text}`;
  }).join('\n\n');
}

function lengthBudget(len) {
  if (len === 'Tight') return 'Tight ≈ 1–2 short sentences per view.';
  if (len === 'Expanded') return 'Expanded ≈ one short paragraph per view.';
  return 'Standard ≈ 3–5 sentences per view.';
}

function readingLevelRules(aud, lvl) {
  const a = aud || 'High school';
  const l = lvl || 'Basic';
  if (l === 'Basic' || /high school|middle|elementary/i.test(a)) {
    return `Reading level (${a} / ${l}): plain words, short sentences, no jargon without a brief gloss. These set HOW you write, not WHAT the source says.`;
  }
  if (l === 'Advanced' || /college|grad/i.test(a)) {
    return `Reading level (${a} / ${l}): precise vocabulary is fine; still stay faithful to the source. These set HOW you write, not WHAT the source says.`;
  }
  return `Reading level (${a} / ${l}): clear prose matched to the audience. These set HOW you write, not WHAT the source says.`;
}

function normalizeConceptCard(raw, prev = {}, { views } = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const want = Array.isArray(views) && views.length
    ? views
    : (Array.isArray(prev.includedViews) ? prev.includedViews : ['definition']);

  const term = String(raw.term || raw.concept || prev.term || '').trim();
  let definition = String(raw.definition || raw.plain || prev.definition || '').trim();
  if (want.includes('definition') && !definition) return null;
  if (!term) return null;
  if (!want.includes('definition')) definition = '';

  const out = {
    id: prev.id || `cc${Date.now()}`,
    term,
    definition,
    includedViews: want,
  };

  const take = (viewKey, field, ...alts) => {
    if (!want.includes(viewKey)) return;
    for (const k of [field, ...alts]) {
      if (typeof raw[k] === 'string' && raw[k].trim()) { out[field] = raw[k].trim(); return; }
    }
    if (typeof prev[field] === 'string' && prev[field].trim()) out[field] = prev[field].trim();
  };

  take('analogy', 'analogy');
  take('example', 'example', 'workedExample');
  take('visual', 'visualSuggestion', 'visual');
  take('misconception', 'misconception', 'misc');

  const cites = (raw.citations && typeof raw.citations === 'object') ? raw.citations : {};
  const prevCites = (prev.citations && typeof prev.citations === 'object') ? prev.citations : {};
  const citations = {};
  for (const v of want) {
    const c = cites[v] || prevCites[v];
    if (typeof c === 'string' && c.trim()) citations[v] = c.trim();
  }
  if (Object.keys(citations).length) out.citations = citations;

  if (typeof raw.voice === 'string' && raw.voice.trim()) out.voice = raw.voice.trim();
  else if (prev.voice) out.voice = prev.voice;
  if (typeof raw.length === 'string' && raw.length.trim()) out.length = raw.length.trim();
  else if (prev.length) out.length = prev.length;

  return out;
}

function buildConceptCardPrompt({ title, config, retrieved, views, prompt }) {
  const c = config || {};
  const len = c.len || 'Standard';
  const aud = c.aud || 'High school';
  const lvl = c.lvl || 'Basic';
  const voi = c.voi || 'Plain & friendly';
  const intent = String(c.concept || title || '').trim();
  const viewSet = new Set(views);

  const fieldLines = [
    'term (string) — the concept name as used in the source',
    viewSet.has('definition') ? 'definition (string) — required: the concept AS THE SOURCE defines it, in the audience\'s words. Disambiguate by the source (e.g. card-game Bridge, not a river bridge).' : null,
    viewSet.has('analogy') ? 'analogy (string) — one concrete analogy that MAPS the concept\'s structure onto the analogy domain; not merely adjacent.' : 'analogy: null',
    viewSet.has('example') ? 'example (string) — a specific instance drawn from the source, stepped through.' : 'example: null',
    viewSet.has('visual') ? 'visualSuggestion (string) — describe a diagram/layout that would help (not prose explanation).' : 'visualSuggestion: null',
    viewSet.has('misconception') ? 'misconception (string) — a real learner mistake about THIS concept, stated then corrected, grounded in the source.' : 'misconception: null',
    'citations (object) — for EACH non-null view key, a short citation string using the chunk ids/from labels you used (e.g. "p.3" or "(2)").',
  ].filter(Boolean);

  const system = [
    'You generate ONE concept card as STRUCTURED JSON for learners.',
    'CRITICAL GROUNDING RULE: Every view MUST be defined by what the retrieved source chunks say about the concept.',
    'If the source is about the card game Bridge, every view is about the card game — full stop. Never invent a different sense.',
    'Do NOT use outside knowledge that contradicts or replaces the source. If a requested view is not supported by the chunks, set that field to null rather than inventing.',
    'Output ONLY a single JSON object. No prose, no markdown fences.',
    `Shape fields: ${fieldLines.join(' | ')}`,
    'Set unrequested optional fields to null.',
    lengthBudget(len),
    readingLevelRules(aud, lvl),
    `Voice (${voi}): tone ONLY — warm, second-person-ish, not lecturing. Never change what is said, only how.`,
  ].join('\n');

  const requestedLabels = views.map((v) => {
    const row = CC_VIEW_MAP.find((r) => r.key === v);
    return row ? row.label : v;
  });

  const user = [
    `Object title: ${title || '(untitled)'}`,
    '--- Intent (retrieval query + disambiguation constraint) ---',
    `Concept to resolve AGAINST THE SOURCE: ${intent}`,
    'The retrieved chunks below ARE the sense of this concept. Define it only as they do.',
    '',
    '--- Define (style only — not content) ---',
    `Audience: ${aud}`,
    `Level: ${lvl}`,
    `Voice: ${voi}`,
    `Length per view: ${len}`,
    `Views to generate (ONLY these, in this order): ${requestedLabels.join(' → ')}`,
    viewSet.has('analogy')
      ? (c.analogy
        ? `Analogy domain (must map onto): ${c.analogy}`
        : 'Analogy domain: (not specified — pick a domain this audience already knows)')
      : '',
    prompt ? `\nAuthor note (style/context only; still ground in chunks):\n${prompt}` : '',
    '',
    '--- Retrieved source chunks (ONLY evidence you may use) ---',
    formatRetrievedChunks(retrieved),
    '',
    'Return the concept card JSON object now.',
  ].filter(Boolean).join('\n');

  return { system, user };
}

/* ─── Summary / Reflection / Assignment / Drill ───────────────────── */

function groundingFromExtracts(extracts, promptOnlyNote) {
  const has = Array.isArray(extracts) && extracts.length > 0;
  return has
    ? 'GROUNDING: Build ONLY from the marked-up source units and Define settings. Do not invent unsupported material.'
    : `GROUNDING: ${promptOnlyNote}`;
}

function normalizeSummary(raw, prev = {}, config = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const shape = String(raw.shape || config.shape || prev.shape || 'Key points');
  const keyPoints = Array.isArray(raw.keyPoints)
    ? raw.keyPoints.map((x) => String(x || '').trim()).filter(Boolean)
    : (Array.isArray(prev.keyPoints) ? prev.keyPoints : []);
  const tldr = String(raw.tldr || prev.tldr || '').trim();
  const body = String(raw.body || prev.body || '').trim();
  if (!tldr && !body && keyPoints.length === 0) return null;
  return {
    shape,
    length: String(raw.length || config.len || prev.length || 'Medium'),
    audience: String(raw.audience || config.aud || prev.audience || 'High school'),
    topic: String(raw.topic || config.what || prev.topic || '').trim() || undefined,
    tldr: tldr || undefined,
    keyPoints: keyPoints.length ? keyPoints : undefined,
    body: body || undefined,
  };
}

function buildSummaryPrompt({ title, config, extracts, prompt }) {
  const c = config || {};
  const nkp = Math.max(3, Math.min(10, Number(c.nkp) || 5));
  const shape = c.shape || 'Key points';
  const system = [
    'You generate ONE learning summary as STRUCTURED JSON.',
    groundingFromExtracts(extracts, 'No marked-up units — build from Define (what to summarise, audience, shape, length) and the author prompt.'),
    'Output ONLY a JSON object. No prose, no markdown fences.',
    'Shape: {"topic":string,"tldr":string|null,"keyPoints":string[]|null,"body":string|null,"shape":string}',
    `Respect shape "${shape}": TL;DR → fill tldr; Key points / Exam-cram → fill keyPoints (exactly ${nkp}); Abstract → fill body; may combine when helpful.`,
    `Length "${c.len || 'Medium'}". Audience "${c.aud || 'High school'}" — reading level only.`,
  ].join('\n');
  const user = [
    `Title: ${title || '(untitled)'}`,
    `What to summarise: ${c.what || title || '(from source)'}`,
    `Audience: ${c.aud || 'High school'}`,
    `Shape: ${shape}`,
    `Length: ${c.len || 'Medium'}`,
    `Number of key points: ${nkp}`,
    prompt ? `\nAuthor prompt:\n${prompt}` : '',
    '',
    '--- Source units ---',
    extractLinesFrom(extracts),
    '',
    'Return the summary JSON now.',
  ].filter(Boolean).join('\n');
  return { system, user };
}

function normalizeReflection(raw, prev = {}, config = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const np = Math.max(1, Math.min(5, Number(config.np) || 2));
  const wantStarters = config.starters === true || /guided|starter/i.test(String(config.style || ''));
  let prompts = Array.isArray(raw.prompts) ? raw.prompts : (Array.isArray(prev.prompts) ? prev.prompts : []);
  prompts = prompts.map((p, i) => {
    const prompt = String(p?.prompt || p?.text || '').trim();
    if (!prompt) return null;
    const starters = Array.isArray(p?.starters)
      ? p.starters.map((s) => String(s || '').trim()).filter(Boolean)
      : undefined;
    return {
      id: p?.id || `rp${i + 1}`,
      prompt,
      starters: wantStarters && starters?.length ? starters : (wantStarters ? undefined : undefined),
    };
  }).filter(Boolean);
  if (wantStarters) {
    prompts = prompts.map((p) => ({
      ...p,
      starters: (p.starters && p.starters.length) ? p.starters : ['I noticed…', 'This connects to…'],
    }));
  } else {
    prompts = prompts.map(({ id, prompt: pr }) => ({ id, prompt: pr }));
  }
  if (!prompts.length) return null;
  return {
    goal: String(raw.goal || config.goal || prev.goal || 'Apply to real life'),
    style: String(raw.style || config.style || prev.style || 'Open-ended'),
    visibility: String(raw.visibility || config.who || prev.visibility || 'Private to learner'),
    voice: String(raw.voice || config.voi || prev.voice || 'Encouraging'),
    audience: String(raw.audience || config.aud || prev.audience || 'High school'),
    prompts: prompts.slice(0, np),
  };
}

function buildReflectionPrompt({ title, config, extracts, prompt }) {
  const c = config || {};
  const np = Math.max(1, Math.min(5, Number(c.np) || 2));
  const starters = c.starters === true;
  const system = [
    'You generate ONE reflection activity as STRUCTURED JSON for learners.',
    groundingFromExtracts(extracts, 'No marked-up units — build from Define (goal, audience, voice, prompt design) and the author prompt.'),
    'Output ONLY a JSON object. No prose, no markdown fences.',
    'Shape: {"goal":string,"style":string,"visibility":string,"voice":string,"prompts":[{"id":string,"prompt":string,"starters":string[]|null}]}',
    `Write exactly ${np} prompts matching style "${c.style || 'Open-ended'}".`,
    starters || /guided/i.test(String(c.style || ''))
      ? 'Include 2 short sentence starters per prompt.'
      : 'Set starters to null unless style requires them.',
    `Voice: ${c.voi || 'Encouraging'} (tone only). Audience: ${c.aud || 'High school'}.`,
  ].join('\n');
  const user = [
    `Title: ${title || '(untitled)'}`,
    `Reflection goal: ${c.goal || 'Apply to real life'}`,
    `Audience: ${c.aud || 'High school'}`,
    `Voice: ${c.voi || 'Encouraging'}`,
    `Style: ${c.style || 'Open-ended'}`,
    `Who sees answers: ${c.who || 'Private to learner'}`,
    `Number of prompts: ${np}`,
    `Include sentence starters: ${starters ? 'yes' : 'no'}`,
    prompt ? `\nAuthor prompt:\n${prompt}` : '',
    '',
    '--- Source units (reflection should connect to this material) ---',
    extractLinesFrom(extracts),
    '',
    'Return the reflection JSON now.',
  ].filter(Boolean).join('\n');
  return { system, user };
}

function normalizeAssignment(raw, prev = {}, config = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const prompt = String(raw.prompt || raw.task || prev.prompt || '').trim();
  if (!prompt) return null;
  const nReq = Math.max(2, Math.min(6, Number(config.req) || 3));
  const nRub = Math.max(2, Math.min(6, Number(config.rubric) || 3));
  let requirements = Array.isArray(raw.requirements)
    ? raw.requirements.map((x) => String(x || '').trim()).filter(Boolean)
    : (Array.isArray(prev.requirements) ? prev.requirements : []);
  let rubric = Array.isArray(raw.rubric) ? raw.rubric : (Array.isArray(prev.rubric) ? prev.rubric : []);
  rubric = rubric.map((r) => ({
    criterion: String(r?.criterion || r?.name || '').trim(),
    description: String(r?.description || '').trim() || undefined,
    levels: Array.isArray(r?.levels) ? r.levels.map((l) => String(l || '').trim()).filter(Boolean) : undefined,
  })).filter((r) => r.criterion);
  if (!requirements.length) requirements = ['Complete the task as described', 'Support claims with evidence from the source'];
  if (!rubric.length) rubric = [
    { criterion: 'Understanding', description: 'Shows grasp of the core ideas' },
    { criterion: 'Clarity', description: 'Clear, organized response' },
  ];
  return {
    objective: String(raw.objective || config.obj || prev.objective || '').trim() || 'Demonstrate understanding',
    taskType: String(raw.taskType || config.tt || prev.taskType || 'Short essay'),
    deliverable: String(raw.deliverable || config.del || prev.deliverable || 'Written text'),
    expectedLength: String(raw.expectedLength || config.el || prev.expectedLength || '~300 words'),
    requireCitations: raw.requireCitations != null ? !!raw.requireCitations : (config.cite !== false),
    prompt,
    requirements: requirements.slice(0, nReq),
    rubric: rubric.slice(0, nRub),
    audience: String(raw.audience || config.aud || prev.audience || 'High school'),
    level: String(raw.level || config.lvl || prev.level || 'Intermediate'),
  };
}

function buildAssignmentPrompt({ title, config, extracts, prompt }) {
  const c = config || {};
  const nReq = Math.max(2, Math.min(6, Number(c.req) || 3));
  const nRub = Math.max(2, Math.min(6, Number(c.rubric) || 3));
  const system = [
    'You generate ONE assignment brief as STRUCTURED JSON for learners.',
    groundingFromExtracts(extracts, 'No marked-up units — build from Define (objective, task, requirements & rubric) and the author prompt.'),
    'Output ONLY a JSON object. No prose, no markdown fences.',
    'Shape: {"objective":string,"taskType":string,"deliverable":string,"expectedLength":string,"requireCitations":boolean,"prompt":string,"requirements":string[],"rubric":[{"criterion":string,"description":string,"levels":string[]|null}]}',
    `Write ${nReq} concrete requirements and ${nRub} rubric criteria.`,
    'The prompt must be actionable and grounded in the source when present.',
  ].join('\n');
  const user = [
    `Title: ${title || '(untitled)'}`,
    `Learning objective: ${c.obj || '(from source)'}`,
    `Audience: ${c.aud || 'High school'}`,
    `Level: ${c.lvl || 'Intermediate'}`,
    `Task type: ${c.tt || 'Short essay'}`,
    `Deliverable: ${c.del || 'Written text'}`,
    `Expected length: ${c.el || '~300 words'}`,
    `Require citations: ${c.cite === false ? 'no' : 'yes'}`,
    `Requirements count: ${nReq}`,
    `Rubric criteria count: ${nRub}`,
    prompt ? `\nAuthor prompt:\n${prompt}` : '',
    '',
    '--- Source units ---',
    extractLinesFrom(extracts),
    '',
    'Return the assignment JSON now.',
  ].filter(Boolean).join('\n');
  return { system, user };
}

function normalizeDrill(raw, prev = {}, config = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const ni = Math.max(5, Math.min(30, Number(config.ni) || 15));
  const fmt = String(raw.format || config.fmt || prev.format || 'Recall');
  let items = Array.isArray(raw.items) ? raw.items : (Array.isArray(prev.items) ? prev.items : []);
  items = items.map((it, i) => {
    const prompt = String(it?.prompt || it?.question || '').trim();
    const answer = String(it?.answer || it?.correct || '').trim();
    if (!prompt || !answer) return null;
    const choices = Array.isArray(it?.choices)
      ? it.choices.map((x) => String(x || '').trim()).filter(Boolean)
      : undefined;
    return {
      id: it?.id || `di${i + 1}`,
      prompt,
      answer,
      choices: /recognition/i.test(fmt) ? (choices && choices.length >= 2 ? choices : undefined) : undefined,
      hint: String(it?.hint || '').trim() || undefined,
      difficulty: ['easy', 'medium', 'hard'].includes(String(it?.difficulty || '').toLowerCase())
        ? String(it.difficulty).toLowerCase()
        : undefined,
    };
  }).filter(Boolean);
  if (!items.length) return null;
  // Ensure recognition items have choices
  if (/recognition/i.test(fmt)) {
    items = items.map((it) => {
      if (it.choices && it.choices.length >= 2) return it;
      const distractors = items.filter((x) => x.id !== it.id).slice(0, 3).map((x) => x.answer);
      const choices = [...new Set([it.answer, ...distractors, 'Not sure'])].slice(0, 4);
      return { ...it, choices };
    });
  }
  return {
    skill: String(raw.skill || config.skill || prev.skill || '').trim() || 'Practice skill',
    format: fmt,
    difficultyCurve: String(raw.difficultyCurve || config.diff || prev.difficultyCurve || 'Easy → hard'),
    feedback: String(raw.feedback || config.fb || prev.feedback || 'Immediate'),
    timed: raw.timed != null ? !!raw.timed : !!config.timed,
    repeatUntilMastery: raw.repeatUntilMastery != null ? !!raw.repeatUntilMastery : !!config.rep,
    level: String(raw.level || config.lvl || prev.level || 'Basic'),
    items: items.slice(0, ni),
  };
}

function buildDrillPrompt({ title, config, extracts, prompt }) {
  const c = config || {};
  const ni = Math.max(5, Math.min(30, Number(c.ni) || 15));
  const fmt = c.fmt || 'Recall';
  const system = [
    'You generate ONE drill (rapid practice set) as STRUCTURED JSON.',
    groundingFromExtracts(extracts, 'No marked-up units — build from Define (skill, practice design) and the author prompt.'),
    'Output ONLY a JSON object. No prose, no markdown fences.',
    'Shape: {"skill":string,"format":string,"difficultyCurve":string,"feedback":string,"timed":boolean,"repeatUntilMastery":boolean,"items":[{"id":string,"prompt":string,"answer":string,"choices":string[]|null,"hint":string|null,"difficulty":"easy"|"medium"|"hard"|null}]}',
    `Write exactly ${ni} items in format "${fmt}".`,
    /recognition/i.test(fmt) ? 'Recognition: each item needs 3–4 choices including the correct answer.' : 'Recall/Application: choices may be null; answer is the expected response.',
    `Difficulty curve: ${c.diff || 'Easy → hard'}. Feedback mode: ${c.fb || 'Immediate'}.`,
  ].join('\n');
  const user = [
    `Title: ${title || '(untitled)'}`,
    `Skill to drill: ${c.skill || title || '(from source)'}`,
    `Level: ${c.lvl || 'Basic'}`,
    `Item format: ${fmt}`,
    `Difficulty: ${c.diff || 'Easy → hard'}`,
    `Feedback: ${c.fb || 'Immediate'}`,
    `Timed: ${c.timed ? 'yes' : 'no'}`,
    `Repeat until mastery: ${c.rep ? 'yes' : 'no'}`,
    `Number of items: ${ni}`,
    prompt ? `\nAuthor prompt:\n${prompt}` : '',
    '',
    '--- Source units ---',
    extractLinesFrom(extracts),
    '',
    'Return the drill JSON now.',
  ].filter(Boolean).join('\n');
  return { system, user };
}

async function generateStructuredObject(kind, body) {
  const builders = {
    summary: buildSummaryPrompt,
    reflection: buildReflectionPrompt,
    assignment: buildAssignmentPrompt,
    drill: buildDrillPrompt,
  };
  const normalizers = {
    summary: normalizeSummary,
    reflection: normalizeReflection,
    assignment: normalizeAssignment,
    drill: normalizeDrill,
  };
  const build = builders[kind];
  const normalize = normalizers[kind];
  const { system, user } = build(body);
  const raw = await callAnthropic({ system, user, maxTokens: kind === 'drill' ? 8192 : 4096 });
  const parsed = extractJson(raw);
  const obj = Array.isArray(parsed) ? parsed[0] : parsed;
  const content = normalize(obj, {}, body?.config || {});
  if (!content) throw new LlmError(502, 'llm_parse', `The model did not return a usable ${kind}.`);
  return content;
}

function buildItemEditPrompt(kind, item, instruction) {
  if (kind === 'summary' || kind === 'reflection' || kind === 'assignment' || kind === 'drill') {
    const shapes = {
      summary: '{"topic":string,"tldr":string|null,"keyPoints":string[]|null,"body":string|null,"shape":string}',
      reflection: '{"goal":string,"style":string,"visibility":string,"voice":string,"prompts":[{"id":string,"prompt":string,"starters":string[]|null}]}',
      assignment: '{"objective":string,"prompt":string,"requirements":string[],"rubric":[{"criterion":string,"description":string}]}',
      drill: '{"skill":string,"items":[{"id":string,"prompt":string,"answer":string,"choices":string[]|null,"hint":string|null}]}',
    };
    const system = [
      `You are editing ONE ${kind} learning object for a course author.`,
      'Return ONLY a JSON object — no prose, no markdown fences.',
      `Shape: ${shapes[kind]}`,
      'Preserve educational accuracy and keep structure unless the instruction changes it.',
    ].join('\n');
    const user = [
      `Current ${kind} (JSON):`,
      JSON.stringify(item, null, 2),
      '',
      `Instruction: ${instruction}`,
      '',
      `Return the edited ${kind} JSON now.`,
    ].join('\n');
    return { system, user };
  }
  if (kind === 'concept-card') {
    const system = [
      'You are editing ONE concept card for a course author.',
      'Return ONLY a JSON object — no prose, no markdown fences.',
      'Shape: {"term":string,"definition":string,"analogy":string|null,"example":string|null,"visualSuggestion":string|null,"misconception":string|null}',
      'Keep the same concept unless the instruction changes it. Preserve accuracy and the requested voice/length if mentioned.',
    ].join('\n');
    const user = [
      'Current concept card (JSON):',
      JSON.stringify(item, null, 2),
      '',
      `Instruction: ${instruction}`,
      '',
      'Return the edited concept card JSON now.',
    ].join('\n');
    return { system, user };
  }
  if (kind === 'flashcard') {
    const system = [
      'You are editing ONE flashcard for a course author.',
      'Return ONLY a JSON object — no prose, no markdown fences.',
      'Shape: {"front":string,"back":string,"hook":string|null,"hint":string|null}',
      'Keep the same intent unless the instruction changes it. Preserve educational accuracy.',
      'hint = optional short cue for the learner on the prompt side (not the full answer).',
      'hook = optional mnemonic under the answer. Use null to clear.',
    ].join('\n');
    const user = [
      'Current flashcard (JSON):',
      JSON.stringify({ front: item.front, back: item.back, hook: item.hook || null, hint: item.hint || null }, null, 2),
      '',
      `Instruction: ${instruction}`,
      '',
      'Return the edited flashcard JSON now.',
    ].join('\n');
    return { system, user };
  }

  // quiz-question
  const system = [
    'You are editing ONE quiz question for a course author.',
    'Return ONLY a JSON object — no prose, no markdown fences.',
    'Shape: {"question":string,"type":"multiple-choice"|"true-false"|"multi-select"|"short-answer"|"scenario","options":string[]|null,"correct":number|null,"correctIndices":number[]|null,"sampleAnswer":string|null,"explanation":string|null,"hint":string|null,"cognitiveLevel":string|null,"difficulty":"easy"|"medium"|"hard"|null}',
    'Keep type unless the instruction asks to change it. Preserve accuracy.',
    'hint = optional short learner cue (not the answer).',
  ].join('\n');
  const user = [
    'Current question (JSON):',
    JSON.stringify(item, null, 2),
    '',
    `Instruction: ${instruction}`,
    '',
    'Return the edited question JSON now.',
  ].join('\n');
  return { system, user };
}

function normalizeEditedFlashcard(raw, prev) {
  if (!raw || typeof raw !== 'object') return null;
  const front = String(raw.front ?? prev.front ?? '').trim();
  const back = String(raw.back ?? prev.back ?? '').trim();
  if (!front || !back) return null;
  const out = { front, back };
  if (typeof raw.hook === 'string' && raw.hook.trim()) out.hook = raw.hook.trim();
  else if (raw.hook === null) { /* cleared */ }
  else if (prev.hook) out.hook = prev.hook;
  if (typeof raw.hint === 'string' && raw.hint.trim()) out.hint = raw.hint.trim();
  else if (raw.hint === null) { /* cleared */ }
  else if (prev.hint) out.hint = prev.hint;
  if (prev.imageUrl) out.imageUrl = prev.imageUrl;
  return out;
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

  /* ---- AI edit: quiz question or flashcard ---- */
  if (method === 'POST' && path === '/api/ai/edit-item') {
    const body = await readJson(req);
    const kind = String(body.kind || '');
    const instruction = String(body.instruction || '').trim();
    const item = body.item && typeof body.item === 'object' ? body.item : null;
    if (!item) return send(res, 400, { code: 'no_item', message: 'Provide an item to edit.' });
    if (!instruction) return send(res, 400, { code: 'no_instruction', message: 'Tell the AI how to change this item.' });
    const allowedKinds = new Set([
      'quiz-question', 'flashcard', 'concept-card',
      'summary', 'reflection', 'assignment', 'drill',
    ]);
    if (!allowedKinds.has(kind)) {
      return send(res, 400, { code: 'bad_kind', message: 'Unsupported edit kind.' });
    }
    try {
      const { system, user } = buildItemEditPrompt(kind, item, instruction);
      const raw = await callAnthropic({ system, user, maxTokens: kind === 'drill' ? 4096 : 2048 });
      const parsed = extractJson(raw);
      const obj = Array.isArray(parsed) ? parsed[0] : parsed;
      if (kind === 'flashcard') {
        const normalized = normalizeEditedFlashcard(obj, item);
        if (!normalized) throw new LlmError(502, 'llm_parse', 'The model did not return a usable flashcard.');
        return send(res, 200, { item: normalized });
      }
      if (kind === 'concept-card') {
        let views = Array.isArray(item?.includedViews) ? item.includedViews.filter(Boolean) : [];
        if (!views.length) {
          views = ['definition'];
          if (item?.analogy) views.push('analogy');
          if (item?.example) views.push('example');
          if (item?.visualSuggestion) views.push('visual');
          if (item?.misconception) views.push('misconception');
        }
        const normalized = normalizeConceptCard(obj, item, { views });
        if (!normalized) throw new LlmError(502, 'llm_parse', 'The model did not return a usable concept card.');
        return send(res, 200, { item: normalized });
      }
      if (kind === 'summary' || kind === 'reflection' || kind === 'assignment' || kind === 'drill') {
        const normalizers = { summary: normalizeSummary, reflection: normalizeReflection, assignment: normalizeAssignment, drill: normalizeDrill };
        const normalized = normalizers[kind](obj, item, {});
        if (!normalized) throw new LlmError(502, 'llm_parse', `The model did not return a usable ${kind}.`);
        return send(res, 200, { item: normalized });
      }
      const normalized = normalizeQuizQuestion(obj, 0, { writeExplanations: true });
      if (!normalized) throw new LlmError(502, 'llm_parse', 'The model did not return a usable question.');
      if (item.id) normalized.id = item.id;
      return send(res, 200, { item: normalized });
    } catch (e) {
      const status = e instanceof LlmError ? e.status : 500;
      return send(res, status, { code: e.code || 'error', message: e.message });
    }
  }

  /* ---- Summary / Reflection / Assignment / Drill: generate (SSE) ---- */
  const structuredGenRoutes = {
    '/api/summaries/generate': 'summary',
    '/api/reflections/generate': 'reflection',
    '/api/assignments/generate': 'assignment',
    '/api/drills/generate': 'drill',
  };
  if (method === 'POST' && structuredGenRoutes[path]) {
    const kind = structuredGenRoutes[path];
    const body = await readJson(req);
    sseStart(res);
    try {
      sseSend(res, { type: 'progress', message: 'Reading your source and Define settings…' });
      sseSend(res, { type: 'progress', message: `Writing the ${kind} with the model…` });
      const content = await generateStructuredObject(kind, body);
      sseSend(res, { type: 'progress', message: 'Assembling…' });
      sseSend(res, { type: 'result', content });
      sseSend(res, { type: 'done' });
    } catch (e) {
      sseSend(res, { type: 'error', code: e.code || 'error', message: e.message || 'Generation failed.' });
    }
    return sseDone(res);
  }

  /* ---- Concept cards: suggest Intent options from markup ---- */
  if (method === 'POST' && path === '/api/concept-cards/suggest-intents') {
    const body = await readJson(req);
    try {
      const suggestions = await suggestConceptIntents({
        extracts: body?.extracts,
        markupUnits: body?.markupUnits,
        sourceUnits: body?.sourceUnits,
        title: body?.title,
        limit: body?.limit,
      });
      return send(res, 200, { suggestions });
    } catch (e) {
      const status = e instanceof LlmError ? e.status : 500;
      return send(res, status, { code: e.code || 'error', message: e.message });
    }
  }

  /* ---- Concept cards: retrieve by Intent → grounded views (SSE) ---- */
  if (method === 'POST' && path === '/api/concept-cards/generate') {
    const body = await readJson(req);
    sseStart(res);
    try {
      const config = body?.config || {};
      const intent = String(config.concept || body?.title || '').trim();
      const views = resolveConceptViews(config.incl);
      sseSend(res, { type: 'progress', message: `Resolving “${intent || 'concept'}” against your marked-up units…` });

      const corpus = buildConceptMarkupCorpus(body);
      const retrieved = retrieveConceptChunksFlexible(intent, corpus, { topK: 8 });
      const { hits, bestScore, query: resolvedIntent } = retrieved;
      // Keep generation aligned with the resolved (validated) intent label.
      if (resolvedIntent && resolvedIntent !== intent) config.concept = resolvedIntent;
      sseSend(res, {
        type: 'progress',
        message: `Grounded in ${hits.length} marked-up unit${hits.length === 1 ? '' : 's'} (score ${bestScore.toFixed(1)}). Writing only the selected views…`,
      });

      const { system, user } = buildConceptCardPrompt({
        title: body?.title,
        config,
        retrieved: hits,
        views,
        prompt: body?.prompt,
      });
      sseSend(res, { type: 'progress', message: 'Writing grounded views with the model…' });
      const raw = await callAnthropic({ system, user, maxTokens: 4096 });
      const parsed = extractJson(raw);
      const obj = Array.isArray(parsed) ? parsed[0] : parsed;
      const card = normalizeConceptCard(obj, {}, { views });
      if (!card) throw new LlmError(502, 'llm_parse', 'The model did not return a usable concept card.');
      if (config.voi) card.voice = String(config.voi);
      if (config.len) card.length = String(config.len);
      // Fallback citations from top retrieved chunks when the model omits them.
      if (!card.citations) card.citations = {};
      const fallbackCite = hits.slice(0, 2).map((h) => h.from || h.id).filter(Boolean).join('; ');
      for (const v of views) {
        if (!card.citations[v] && fallbackCite) card.citations[v] = fallbackCite;
      }
      sseSend(res, { type: 'progress', message: 'Assembling the concept card…' });
      sseSend(res, { type: 'card', card });
      sseSend(res, { type: 'done' });
    } catch (e) {
      sseSend(res, { type: 'error', code: e.code || 'error', message: e.message || 'Generation failed.' });
    }
    return sseDone(res);
  }

  /* ---- Quizzes: generate (real LLM, streamed as SSE) ---- */
  if (method === 'POST' && path === '/api/quizzes/generate') {
    const body = await readJson(req);
    sseStart(res);
    try {
      sseSend(res, { type: 'progress', message: 'Reading your source and Define settings…' });
      const { system, user, nq, adaptive } = buildQuizPrompt(body);
      sseSend(res, { type: 'progress', message: `Writing ${nq} quiz questions with the model…` });
      const raw = await callAnthropic({ system, user, maxTokens: 8192 });
      const parsed = extractJson(raw);
      const arr = Array.isArray(parsed) ? parsed : [];
      const writeExplanations = body?.config?.perq !== false;
      const questions = arr
        .map((q, i) => normalizeQuizQuestion(q, i, { writeExplanations }))
        .filter(Boolean);
      if (questions.length === 0) {
        throw new LlmError(502, 'llm_no_questions', 'The model did not return any usable questions. Try again.');
      }
      sseSend(res, { type: 'progress', message: `Assembling ${questions.length} questions…` });
      for (const question of questions) {
        sseSend(res, { type: 'question', question });
        await sleep(60);
      }
      sseSend(res, {
        type: 'done',
        count: questions.length,
        passMark: parsePassMark(body?.config?.pass),
        showExplanations: String(body?.config?.show || 'After attempt'),
        adaptive: !!adaptive,
      });
    } catch (e) {
      sseSend(res, { type: 'error', code: e.code || 'error', message: e.message || 'Generation failed.' });
    }
    return sseDone(res);
  }

  /* ---- Flashcards: generate (real LLM, streamed as SSE) ---- */
  if (method === 'POST' && path === '/api/flashcards/generate') {
    const body = await readJson(req);
    sseStart(res);
    try {
      sseSend(res, { type: 'progress', message: 'Reading your source and settings…' });
      const cards = [];
      const wantImages = wantsImageCards(body.config);
      const visionImages = Array.isArray(body.images)
        ? body.images.filter((img) => img && img.id && img.url)
        : [];

      if (wantImages && visionImages.length === 0 && textCardStyles(body.config).length === 0) {
        throw new LlmError(400, 'no_images', 'Image → label needs images uploaded in Sources.');
      }

      // 1) Text cards from PDF + Define (any non–Image→label styles)
      const textPrompt = buildFlashcardPrompt(body);
      if (textPrompt) {
        sseSend(res, { type: 'progress', message: 'Writing text flashcards from your PDF and Define settings…' });
        const raw = await callAnthropic({ system: textPrompt.system, user: textPrompt.user, maxTokens: 8192 });
        const parsed = extractJson(raw);
        const arr = Array.isArray(parsed) ? parsed : [];
        for (const c of arr.map((x, i) => normalizeCard(x, i)).filter(Boolean)) cards.push(c);
      }

      // 2) Image → label: vision describes each author upload against the material
      if (wantImages && visionImages.length > 0) {
        let i = 0;
        for (const image of visionImages) {
          i += 1;
          sseSend(res, { type: 'progress', message: `Looking at uploaded image ${i} of ${visionImages.length}…` });
          const card = await buildImageLabelCard({
            image,
            title: body.title,
            config: body.config,
            extracts: body.extracts,
            prompt: body.prompt,
          }, cards.length + i);
          cards.push(card);
          sseSend(res, { type: 'card', card });
          await sleep(40);
        }
      }

      // Stream text cards (image cards already streamed above)
      const textCards = cards.filter((c) => !c.imageRef);
      if (textCards.length) {
        sseSend(res, { type: 'progress', message: `Assembling ${textCards.length} text cards…` });
        for (const card of textCards) {
          sseSend(res, { type: 'card', card });
          await sleep(60);
        }
      }

      if (cards.length === 0) throw new LlmError(502, 'llm_no_cards', 'The model did not return any usable cards. Try again.');
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

  /* ---- Ask AI: scoped to one learning object's content ---- */
  if (method === 'POST' && path === '/api/ask') {
    const body = await readJson(req);
    const message = String(body.message || '').trim();
    const context = String(body.context || '').trim();
    const title = String(body.title || 'this learning object');
    const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
    if (!message) return send(res, 400, { code: 'no_message', message: 'Ask a question.' });
    if (!context) return send(res, 400, { code: 'no_context', message: 'No learning-object content to ground the answer.' });

    const system = [
      'You are Hoot, a friendly study tutor owl for the LAIC learning platform.',
      `You may ONLY answer using the content of the learning object titled "${title}".`,
      'If the question is outside that content, say you can only help with this object and briefly point them back to what it covers.',
      'Be concise, clear, and encouraging. Use short paragraphs. Do not invent facts beyond the provided content.',
      'You may use light markdown: **bold** for key terms, and - bullet lists. Do not use headings or code fences.',
    ].join(' ');

    const historyLines = history
      .filter((h) => h && (h.role === 'user' || h.role === 'assistant') && h.content)
      .map((h) => `${h.role === 'user' ? 'Learner' : 'Hoot'}: ${h.content}`)
      .join('\n');

    const user = [
      `Learning object: ${title}`,
      '',
      '=== CONTENT (your only knowledge source) ===',
      context.slice(0, 14000),
      '=== END CONTENT ===',
      historyLines ? `\nRecent conversation:\n${historyLines}\n` : '',
      `Learner question: ${message}`,
      '',
      'Answer based only on the content above.',
    ].join('\n');

    try {
      const reply = await callAnthropic({ system, user, maxTokens: 1024 });
      return send(res, 200, { reply: reply.trim() });
    } catch (e) {
      const status = e instanceof LlmError ? e.status : 500;
      return send(res, status, { code: e.code || 'error', message: e.message });
    }
  }

  return send(res, 404, { code: 'not_found', message: `No route for ${method} ${path}` });
});

server.listen(PORT, () => {
  console.log(`\nLAIC dev backend → http://localhost:${PORT}`);
  console.log(`LLM: ${ANTHROPIC_API_KEY ? `enabled (model ${LLM_MODEL})` : 'DISABLED — set ANTHROPIC_API_KEY in .env'}`);
  console.log('Tutorial: POST /api/tutorials/suggest-highlights · POST /api/tutorials/generate (SSE)');
  console.log('Ask AI: POST /api/ask');
  console.log('Sources stub: GET/POST /api/sources · GET /api/collections\n');
});
