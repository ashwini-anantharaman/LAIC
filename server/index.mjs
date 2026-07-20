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
import { orderTutorialParts } from '../src/lib/tutorialOrder.js';
import { attachHintsToQuestionParts, ensureFourHints, resolveHintSettings } from '../src/lib/questionHints.js';

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

/** Pull the first JSON value (array or object) out of a possibly fenced string.
 *  Also recovers truncated LLM arrays by extracting complete top-level objects. */
function extractJson(str) {
  let s = String(str || '').trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  // Drop leading prose before the first JSON bracket.
  const firstArr = s.indexOf('[');
  const firstObj = s.indexOf('{');
  if (firstArr === -1 && firstObj === -1) {
    throw new LlmError(502, 'llm_parse', 'Could not find JSON in the LLM response.');
  }
  const start = firstArr === -1 ? firstObj : firstObj === -1 ? firstArr : Math.min(firstArr, firstObj);
  s = s.slice(start);

  try {
    return JSON.parse(s);
  } catch {
    /* fall through — try repairs */
  }

  // Trailing commas before } or ]
  const noTrailingCommas = s.replace(/,\s*([}\]])/g, '$1');
  try {
    return JSON.parse(noTrailingCommas);
  } catch {
    /* continue */
  }

  // Truncated array: harvest every complete top-level {...} object.
  if (s[0] === '[') {
    const objs = extractCompleteObjects(s);
    if (objs.length) return objs;
  }

  // Truncated single object — rarely useful, but try closing braces.
  if (s[0] === '{') {
    const closed = closeTruncatedJson(s);
    try {
      return JSON.parse(closed);
    } catch {
      /* continue */
    }
  }

  throw new LlmError(
    502,
    'llm_parse',
    'The model returned incomplete or invalid JSON (often from a long tutorial hitting the length limit). Try fewer sections/checks, or generate again.',
  );
}

/** Walk text and return every complete top-level `{...}` object that parses. */
function extractCompleteObjects(text) {
  const out = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    while (i < n && text[i] !== '{') i += 1;
    if (i >= n) break;
    const start = i;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (; i < n; i += 1) {
      const ch = text[i];
      if (inStr) {
        if (esc) { esc = false; continue; }
        if (ch === '\\') { esc = true; continue; }
        if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') { inStr = true; continue; }
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          const slice = text.slice(start, i + 1);
          try {
            out.push(JSON.parse(slice));
          } catch {
            try {
              out.push(JSON.parse(slice.replace(/,\s*([}\]])/g, '$1')));
            } catch { /* skip broken object */ }
          }
          i += 1;
          break;
        }
      }
    }
    if (depth !== 0) break; // truncated mid-object — stop
  }
  return out;
}

function closeTruncatedJson(s) {
  let inStr = false;
  let esc = false;
  const stack = [];
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']');
    else if (ch === '}' || ch === ']') stack.pop();
  }
  let out = s;
  if (inStr) out += '"';
  while (stack.length) out += stack.pop();
  return out.replace(/,\s*([}\]])/g, '$1');
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

/* ─── Tutorial: document-level markup flags (review list, not per-sentence) ── */

const FLAG_KINDS = new Set(['core', 'confusion', 'diagram', 'out_of_scope']);
const FLAG_KIND_TO_TAG = {
  core: 'Use',
  confusion: 'Note',
  diagram: 'Support',
  out_of_scope: 'Ignore',
};

function buildFlagCorpus(items, offset = 0) {
  return items.map((it, j) => {
    const i = offset + j;
    const text = String(it?.text || '').replace(/\s+/g, ' ').trim().slice(0, 220);
    return `[${i}|p${it?.page || 1}] ${text}`;
  }).join('\n');
}

function normalizeMarkupFlags(parsed, items) {
  const arr = Array.isArray(parsed)
    ? parsed
    : (parsed && Array.isArray(parsed.flags) ? parsed.flags : []);
  const n = items.length;
  const out = [];
  const seen = new Set();
  for (const raw of arr) {
    if (!raw || typeof raw !== 'object') continue;
    let kind = String(raw.kind || '').toLowerCase().replace(/-/g, '_');
    if (kind === 'out-of-scope' || kind === 'outofscope') kind = 'out_of_scope';
    if (!FLAG_KINDS.has(kind)) continue;
    let startIdx = Number(raw.startIdx ?? raw.start ?? raw.from);
    let endIdx = Number(raw.endIdx ?? raw.end ?? raw.to ?? startIdx);
    if (!Number.isInteger(startIdx) || startIdx < 0 || startIdx >= n) continue;
    if (!Number.isInteger(endIdx) || endIdx < startIdx) endIdx = startIdx;
    if (endIdx >= n) endIdx = n - 1;
    // Cap span length so one flag does not swallow the whole doc
    if (endIdx - startIdx > 8) endIdx = startIdx + 8;
    const key = `${kind}:${startIdx}-${endIdx}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const excerpt = items
      .slice(startIdx, endIdx + 1)
      .map((it) => String(it?.text || '').trim())
      .filter(Boolean)
      .join(' ');
    if (!excerpt) continue;
    const title = String(raw.title || raw.label || '').trim()
      || excerpt.slice(0, 72) + (excerpt.length > 72 ? '…' : '');
    const suggestedTag = FLAG_KIND_TO_TAG[kind] || 'Use';
    out.push({
      id: `flag-${Date.now().toString(36)}-${out.length}`,
      kind,
      title,
      rationale: String(raw.rationale || raw.why || '').trim() || undefined,
      startIdx,
      endIdx,
      page: items[startIdx]?.page || 1,
      excerpt: excerpt.slice(0, 600),
      suggestedTag,
      status: 'pending',
    });
  }
  return out;
}

function quotaSelectFlags(flags) {
  const quotas = { core: 12, confusion: 4, diagram: 6, out_of_scope: 3 };
  const buckets = { core: [], confusion: [], diagram: [], out_of_scope: [] };
  for (const f of flags) {
    if (buckets[f.kind]) buckets[f.kind].push(f);
  }
  const selected = [];
  for (const kind of Object.keys(quotas)) {
    selected.push(...buckets[kind].slice(0, quotas[kind]));
  }
  // If under target, fill from leftovers by document order
  if (selected.length < 18) {
    const used = new Set(selected.map((f) => f.id));
    const rest = flags.filter((f) => !used.has(f.id)).sort((a, b) => a.startIdx - b.startIdx);
    for (const f of rest) {
      if (selected.length >= 28) break;
      selected.push(f);
    }
  }
  selected.sort((a, b) => a.startIdx - b.startIdx);
  return selected.slice(0, 30);
}

function summarizeFlags(flags) {
  const counts = { core: 0, confusion: 0, diagram: 0, out_of_scope: 0 };
  for (const f of flags) if (counts[f.kind] != null) counts[f.kind] += 1;
  const parts = [];
  if (counts.core) parts.push(`${counts.core} passage${counts.core === 1 ? '' : 's'} carry core concepts`);
  if (counts.confusion) parts.push(`${counts.confusion} look like places students commonly confuse things`);
  if (counts.diagram) parts.push(`${counts.diagram} mention diagrams or visuals worth pulling in`);
  if (counts.out_of_scope) parts.push(`${counts.out_of_scope} section${counts.out_of_scope === 1 ? '' : 's'} seem out of scope`);
  if (!parts.length) return 'No review items found — try a clearer learning focus, or mark up manually.';
  return parts.join('. ') + '.';
}

async function suggestMarkupFlagsPass(corpus, { instruction, objective, title, scopeNote }) {
  const system = [
    'You help a course author mark up a source for a tutorial.',
    'Read the numbered sentences once and return a SMALL set of decision items — not one flag per sentence.',
    'Each item is a short passage span (startIdx–endIdx inclusive) with a kind:',
    '  core — load-bearing concepts / definitions / rules the tutorial must teach',
    '  confusion — places learners commonly mix up or misread',
    '  diagram — text that points to a figure, table, diagram, or visual worth importing',
    '  out_of_scope — material that seems peripheral given the learning outcome',
    'Respond ONLY with a JSON array of objects:',
    '{"kind":"core"|"confusion"|"diagram"|"out_of_scope","title":string,"rationale":string,"startIdx":number,"endIdx":number}',
    'Aim for roughly 15–28 items total across kinds for a full document (fewer for a short excerpt). Prefer multi-sentence spans when a idea spans adjacent lines. Do not flag filler.',
  ].join('\n');
  const user = [
    title ? `Document: ${title}` : '',
    objective ? `Learning outcome / focus: ${objective}` : '',
    instruction ? `Author note: ${instruction}` : '',
    scopeNote || '',
    '',
    'Sentences (format [index|page] text):',
    corpus,
    '',
    'Return the JSON array of flag objects now.',
  ].filter(Boolean).join('\n');
  const raw = await callAnthropic({ system, user, maxTokens: 4096 });
  return extractJson(raw);
}

/**
 * One-pass (or batched) document scan → compact review list for the author.
 * @param {{ text: string, page?: number }[]} items
 */
async function suggestMarkupFlags(items, opts = {}) {
  const list = Array.isArray(items) ? items.filter((it) => it && String(it.text || '').trim()) : [];
  if (!list.length) throw new LlmError(400, 'no_sentences', 'No sentences to analyze.');

  const n = list.length;
  let collected = [];

  if (n <= 160) {
    const parsed = await suggestMarkupFlagsPass(buildFlagCorpus(list), {
      instruction: opts.instruction,
      objective: opts.objective,
      title: opts.title,
      scopeNote: 'This is the full document excerpt available for markup.',
    });
    collected = normalizeMarkupFlags(parsed, list);
  } else {
    // Longer docs: scan in page-ish batches, then quota-select a short review list
    const batches = [];
    let start = 0;
    while (start < n) {
      const startPage = list[start].page || 1;
      let end = start + 1;
      while (
        end < n
        && (end - start) < 55
        && (list[end].page || 1) <= startPage + 4
      ) {
        end += 1;
      }
      if (end === start) end = Math.min(n, start + 45);
      batches.push([start, end]);
      start = end;
    }
    // Cap API fan-out
    const maxBatches = 6;
    const step = batches.length > maxBatches ? Math.ceil(batches.length / maxBatches) : 1;
    const chosen = [];
    for (let i = 0; i < batches.length; i += step) chosen.push(batches[i]);

    for (const [a, b] of chosen) {
      const slice = list.slice(a, b);
      const parsed = await suggestMarkupFlagsPass(buildFlagCorpus(slice, a), {
        instruction: opts.instruction,
        objective: opts.objective,
        title: opts.title,
        scopeNote: `This is a chunk of the document (sentences ${a}–${b - 1} of ${n}). Flag only items in this chunk.`,
      });
      collected.push(...normalizeMarkupFlags(parsed, list));
    }
  }

  const flags = quotaSelectFlags(collected);
  // Re-id after select for stability
  const stamped = flags.map((f, i) => ({ ...f, id: `flag-${Date.now().toString(36)}-${i}` }));
  return { flags: stamped, summary: summarizeFlags(stamped) };
}

/* ─── Tutorial: structured extract (classify / dedupe / cluster) ─── */

const UNIT_KINDS = ['Definition', 'Key point', 'Example', 'Quote', 'Fact', 'Procedure'];

function classifyUnitKind(text) {
  const t = String(text || '');
  if (/^\s*["“'‘]/.test(t) || /\b(said|wrote|according to)\b/i.test(t)) return 'Quote';
  // Examples before definitions — "for example … means" is still an example.
  if (/\b(for example|e\.g\.|such as|worked example|suppose|imagine)\b/i.test(t)) return 'Example';
  if (/\b(is defined as|means|refers to|is called|definition of|known as)\b/i.test(t)
    || /^['"]?\w[\w\s-]{0,40}['"]?\s+is\s+/i.test(t)) return 'Definition';
  if (/\b(first|then|next|finally|step\s*\d|one at a time|distribute|procedure|how to)\b/i.test(t)
    || /\d+\.\s+\w/.test(t)) return 'Procedure';
  if (/\b(\d+|always|never|must|points?|score|equals?|ace|king|queen)\b/i.test(t)
    && t.split(/\s+/).length < 40) return 'Fact';
  return 'Key point';
}

function normalizeTextKey(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '').trim();
}

function jaccard(a, b) {
  const A = new Set(normalizeTextKey(a).split(' ').filter((w) => w.length > 2));
  const B = new Set(normalizeTextKey(b).split(' ').filter((w) => w.length > 2));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter += 1;
  return inter / (A.size + B.size - inter);
}

function dedupePassages(passages) {
  const out = [];
  for (const p of passages) {
    const text = String(p.text || '').trim();
    if (text.length < 8) continue;
    const hit = out.find((o) => jaccard(o.text, text) >= 0.72 || normalizeTextKey(o.text) === normalizeTextKey(text));
    if (hit) {
      if (text.length > hit.text.length) hit.text = text;
      hit.sourceHighlightIds = [...(hit.sourceHighlightIds || []), ...(p.sourceHighlightIds || [])];
      continue;
    }
    out.push({ ...p, text });
  }
  return out;
}

function clusterNameFromText(text) {
  const t = String(text || '');
  const lower = t.toLowerCase();
  if (/\b(deal|dealer|distribut|hand of 13|shuffle)\b/.test(lower)) return 'Dealing';
  if (/\b(bid|auction|contract|notrump|no-trump|opening)\b/.test(lower)) return 'Bidding';
  if (/\b(trick|lead|follow suit|trump|declarer|dummy|play)\b/.test(lower)) return 'Play of the hand';
  if (/\b(score|scoring|points|vulnerable|overtrick|undertrick)\b/.test(lower)) return 'Scoring';
  if (/\b(hcp|high-card|ace|king|queen|jack|honor)\b/.test(lower)) return 'Hand evaluation';
  if (/\b(suit|spade|heart|diamond|club|rank)\b/.test(lower)) return 'Cards & suits';
  // First meaningful noun-ish phrase
  const m = t.match(/\b([A-Z][a-z]+(?:\s+[a-z]+){0,2})\b/);
  if (m) return m[1];
  const words = t.split(/\s+/).slice(0, 4).join(' ');
  return words.length > 28 ? `${words.slice(0, 28)}…` : (words || 'Topic');
}

function buildClusteredKnowledgeBase({ highlights, extracts, shapeIntent, objective, topic }) {
  const raw = [];
  if (Array.isArray(highlights) && highlights.length) {
    for (const h of highlights) {
      if (h.tag !== 'Use' && h.tag !== 'Support') continue;
      const text = h.comment ? `${h.text} — ${h.comment}` : h.text;
      raw.push({
        text,
        from: h.page != null ? `p.${h.page}` : undefined,
        fromHl: true,
        sourceHighlightIds: [h.idx].filter((n) => n != null),
      });
    }
  } else if (Array.isArray(extracts)) {
    for (const e of extracts) {
      raw.push({
        text: e.text,
        from: e.from,
        fromHl: !!e.fromHl,
        kind: e.kind,
        sourceHighlightIds: e.sourceHighlightIds,
      });
    }
  }

  const rawHighlightCount = raw.length;
  let merged = dedupePassages(raw);

  // Shape intent: prefer defs/examples or keep short
  const intent = String(shapeIntent || '').toLowerCase();
  if (intent.includes('definition') || intent.includes('example')) {
    merged = merged.filter((p) => {
      const k = p.kind || classifyUnitKind(p.text);
      if (intent.includes('definition') && intent.includes('example')) {
        return k === 'Definition' || k === 'Example' || k === 'Key point' || k === 'Fact';
      }
      if (intent.includes('definition')) return k === 'Definition' || k === 'Key point';
      if (intent.includes('example')) return k === 'Example' || k === 'Procedure' || k === 'Key point';
      return true;
    });
  }
  if (/\bshort\b/.test(intent)) {
    merged = merged.map((p) => ({
      ...p,
      text: p.text.split(/(?<=[.!?])\s+/).slice(0, 2).join(' '),
    }));
  }

  const units = merged.map((p, i) => ({
    id: p.id || `u${i + 1}`,
    kind: UNIT_KINDS.includes(p.kind) ? p.kind : classifyUnitKind(p.text),
    text: p.text,
    from: p.from,
    fromHl: !!p.fromHl,
    sourceHighlightIds: p.sourceHighlightIds || [],
  }));

  // Cluster by name heuristic
  const byName = new Map();
  for (const u of units) {
    const name = clusterNameFromText(u.text);
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(u);
  }
  // Merge tiny clusters into nearest larger by shared tokens
  let clusters = [...byName.entries()].map(([name, list], i) => ({
    id: `c${i + 1}`,
    name,
    unitIds: list.map((u) => u.id),
  }));
  if (clusters.length > 8) {
    clusters = clusters
      .sort((a, b) => b.unitIds.length - a.unitIds.length)
      .slice(0, 8);
  }
  // Assign clusterId on units
  const idToCluster = new Map();
  for (const c of clusters) for (const uid of c.unitIds) idToCluster.set(uid, c.id);
  // Remap units that fell out of trimmed clusters into largest
  const fallback = clusters[0]?.id;
  for (const u of units) {
    u.clusterId = idToCluster.get(u.id) || fallback;
    if (!idToCluster.has(u.id) && fallback) {
      clusters[0].unitIds.push(u.id);
    }
  }

  const gaps = [];
  const blob = units.map((u) => u.text.toLowerCase()).join(' ');
  const obj = `${objective || ''} ${topic || ''}`.toLowerCase();
  const checkGap = (needle, label) => {
    if (obj.includes(needle) && !blob.includes(needle)) {
      gaps.push({
        id: `gap-${needle}`,
        message: `Your objective/topic mentions ${label}, but no marked-up material covers ${label}.`,
        severity: 'warn',
      });
    }
  };
  checkGap('scor', 'scoring');
  checkGap('bid', 'bidding');
  checkGap('deal', 'dealing');
  if (obj.trim() && units.length === 0) {
    gaps.push({
      id: 'gap-empty',
      message: 'No content units yet — pull and cluster markup before generating.',
      severity: 'error',
    });
  }

  return {
    units,
    clusters,
    rawHighlightCount,
    mergedUnitCount: units.length,
    shapeIntent: shapeIntent || undefined,
    gaps,
  };
}

async function refineClustersWithLlm(kb, { objective, topic, shapeIntent }) {
  if (!ANTHROPIC_API_KEY || !kb.units.length) return kb;
  const sample = kb.units.slice(0, 40).map((u, i) => `(${i}) [${u.kind}] ${u.text.slice(0, 220)}`).join('\n');
  const system = [
    'You organize tutorial source units into concept clusters.',
    'Return ONLY JSON: {"clusters":[{"name":string,"unitIndices":number[]}]}',
    'Every unit index 0..n-1 must appear in exactly one cluster. Prefer 3–6 clusters with clear topic names.',
  ].join(' ');
  const user = [
    `Objective: ${objective || '(none)'}`,
    `Topic: ${topic || '(none)'}`,
    shapeIntent ? `Shape intent: ${shapeIntent}` : '',
    '',
    'Units:',
    sample,
    '',
    'Return cluster JSON now.',
  ].filter(Boolean).join('\n');
  try {
    const raw = await callAnthropic({ system, user, maxTokens: 2048 });
    const parsed = extractJson(raw);
    const arr = Array.isArray(parsed?.clusters) ? parsed.clusters : [];
    if (!arr.length) return kb;
    const clusters = [];
    const claimed = new Set();
    arr.forEach((c, i) => {
      const idxs = (c.unitIndices || []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < kb.units.length);
      const unitIds = [];
      for (const n of idxs) {
        if (claimed.has(n)) continue;
        claimed.add(n);
        unitIds.push(kb.units[n].id);
      }
      if (unitIds.length) clusters.push({ id: `c${i + 1}`, name: String(c.name || `Topic ${i + 1}`).slice(0, 48), unitIds });
    });
    // Orphans → Misc
    const orphanIds = kb.units.filter((_, i) => !claimed.has(i)).map((u) => u.id);
    if (orphanIds.length) clusters.push({ id: `c${clusters.length + 1}`, name: 'Other', unitIds: orphanIds });
    if (!clusters.length) return kb;
    const units = kb.units.map((u) => {
      const cl = clusters.find((c) => c.unitIds.includes(u.id));
      return { ...u, clusterId: cl?.id };
    });
    return { ...kb, units, clusters };
  } catch {
    return kb;
  }
}

/* ─── Tutorial: generate ──────────────────────────────────────────── */

function buildGeneratePrompt(body) {
  const { title, config, extracts, prompt, media, template, knowledgeBase, sectionPlans } = body || {};
  const c = config || {};
  const num = (v, d) => (typeof v === 'number' ? v : d);
  const secs = num(c.secs, 3);
  const chks = num(c.chks, 1);
  const excpts = num(c.excpts, 1);
  const wex = c.wex !== false;
  const end = c.end || 'Recap only';
  const authorPrompt = prompt || (config && config.prompt) || '';
  const mediaList = Array.isArray(media) ? media.filter((m) => m && m.ref) : [];

  // Template + cluster path (preferred)
  if (template && Array.isArray(sectionPlans) && sectionPlans.length && knowledgeBase?.units?.length) {
    const unitsById = new Map((knowledgeBase.units || []).map((u) => [u.id, u]));
    const clusterLines = sectionPlans.map((sp) => {
      const cluster = (knowledgeBase.clusters || []).find((x) => x.id === sp.clusterId);
      const units = (cluster?.unitIds || [])
        .map((id) => unitsById.get(id))
        .filter(Boolean)
        .map((u, i) => `    (${i + 1}) [${u.kind}] ${u.text}${u.from ? ` — ${u.from}` : ''}`)
        .join('\n');
      const recipe = (sp.recipe || template.sectionBlockRecipe || [])
        .map((r, i) => `${i + 1}. ${r.type}${r.preferKinds ? ` (prefer: ${r.preferKinds.join(', ')})` : ''}`)
        .join('; ');
      const mediaPl = (sp.mediaPlacements || [])
        .map((m) => `slot ${m.slotId} → ref ${m.mediaRef}`)
        .join(', ') || '(none)';
      return [
        `### Section ${sp.index + 1}: ${sp.title}`,
        sp.subheads?.length ? `Subheads: ${sp.subheads.join(' · ')}` : '',
        `Recipe: ${recipe}`,
        `Media slots: ${mediaPl}`,
        'SOURCE UNITS FOR THIS SECTION ONLY (do not use other sections\' units):',
        units || '    (empty cluster — say so in a short note; do NOT invent facts)',
      ].filter(Boolean).join('\n');
    }).join('\n\n');

    const allowExtra = c.aiExtra === true;
    const groundingStrict = [
      'CRITICAL: Each section must be built ONLY from that section\'s listed source units. Do not use general encyclopedia knowledge.',
      'If a cluster is thin, write a short grounded note — do not invent facts outside those units.',
    ].join(' ');
    const groundingExtra = [
      'PRIMARY SOURCE: Prefer each section\'s listed source units as the backbone of the teaching.',
      'AI EXTRAS ALLOWED: You MAY add brief bridging explanations, standard prerequisites, or clarifying background you judge a learner needs for the objective — even if not explicitly in the units.',
      'Keep extras clearly helpful and on-topic; do not contradict the source units; do not turn the tutorial into a generic encyclopedia article.',
      'When you add material not in the units, keep it short and label the part with a normal pedagogical label (e.g. Explanation) — do not claim it is a source excerpt.',
    ].join(' ');

    const system = [
      'You generate a tutorial as STRUCTURED JSON from a FIXED pedagogical template and CLUSTERED source units.',
      allowExtra ? groundingExtra : groundingStrict,
      'Output ONLY a JSON array of part objects. No markdown fences.',
      'Part shapes:',
      '  {"type":"rich-text","label":string,"heading":string|null,"subheads":string[]|null,"body":string}',
      '  {"type":"question","label":string,"prompt":string,"options":[four strings],"correct":0-3,"exp":string,"hints":[four strings]}',
      '  {"type":"media","ref":string}',
      'For each section: emit a rich-text with heading set to the section title (and subheads if given), then follow the recipe order.',
      'knowledge-check / try-it → question parts. worked-example / explanation / instruction / principle / misconception / correction / scenario-advance / source-excerpt → rich-text with an appropriate label.',
      'Number question labels sequentially across the whole tutorial: "Question 1", "Question 2", …',
      'CHECK PLACEMENT (critical): When assessment is after_each_section or checkpoints, finish ALL teaching parts for a section, then emit that section\'s question(s) IMMEDIATELY before starting the next section heading. Never dump all questions at the end. Never put Section 2\'s teaching before Section 1\'s check. Each question must test ONLY the section it follows.',
      'HINTS: Follow the author\'s hint settings below. If hints are ON, every question must include exactly that many progressive strings in "hints". Hint 1 lightly points; later hints get more specific; at least one must tell the learner which section/passage to re-read (use that section\'s title). Never reveal the correct option letter/text. If hints are OFF, set "hints" to [].',
      'Place media parts only where section media slots specify. Keep bodies 2–5 short sentences.',
    ].join('\n');

    const assess = template.assessmentPlacement || 'after_each_section';
    const hintOpts = resolveHintSettings(c);
    const user = [
      `Tutorial title: ${title || '(untitled)'}`,
      `Template: ${template.name || template.id} (${template.id})`,
      `Section connection: ${template.sectionConnection || 'sequential'}`,
      `Assessment placement: ${assess}`,
      `Learning objective: ${c.obj || '(none)'}`,
      `Overall topic: ${c.topic || title || '(none)'}`,
      `Audience: ${c.aud || 'High school'} · Level: ${c.lvl || 'Basic'} · Depth: ${c.dpth || 'Standard'}`,
      `Checks per section knob: ${chks} (honor template assessment placement; if after_each_section / checkpoints, emit ~${Math.max(chks, 1)} check(s) per section from THAT section's units)`,
      `Pass mark (all checks combined): ${c.pass || '70%'}`,
      `Progressive hints: ${hintOpts.enabled ? `ON — exactly ${hintOpts.count} per question` : 'OFF — set hints to []'}`,
      `AI extras beyond source: ${allowExtra ? 'ON — may add helpful bridging/background not in the units' : 'OFF — stay strictly within marked-up units'}`,
      `End with: ${end}`,
      authorPrompt ? `Author note:\n${authorPrompt}` : '',
      '',
      'SECTION PLANS (one cluster each):',
      clusterLines,
      '',
      mediaList.length ? `Available media refs: ${mediaList.map((m) => `${m.ref}(${m.kind})`).join(', ')}` : 'No media attached.',
      '',
      'Produce IN ORDER: (1) Introduction rich-text with heading "Introduction", (2) for EACH section: teaching parts then that section\'s check(s), (3) closing per End with.',
      assess === 'end_only' ? 'Put knowledge-check questions ONLY after all sections (end quiz), not mid-section.' : '',
      assess === 'none' ? 'Do not emit knowledge-check questions.' : '',
      (assess === 'after_each_section' || assess === 'checkpoints_after_each')
        ? `Pattern per section: [heading rich-text] → [teaching…] → [${Math.max(chks, 1)} question(s)] → next section.`
        : '',
      'Return the JSON array now.',
    ].filter(Boolean).join('\n');

    return { system, user, secs: sectionPlans.length };
  }

  // Legacy flat-extract fallback
  const hasExtracts = Array.isArray(extracts) && extracts.length > 0;
  const extractLines = hasExtracts
    ? extracts.map((e, i) => `(${i + 1}) [${e.kind || 'Key point'}] ${e.text}${e.from ? ` — ${e.from}` : ''}`).join('\n')
    : '(no content units — refuse to invent; ask author to mark up source)';

  const allowExtraLegacy = c.aiExtra === true;
  const groundingRule = !hasExtracts
    ? 'GROUNDING: No units provided. Return a single rich-text part explaining that markup/extracts are required — do not write a fake tutorial.'
    : allowExtraLegacy
      ? 'GROUNDING: Prefer the content units as the backbone. AI EXTRAS ALLOWED: you may add brief bridging explanations or standard background you judge learners need, without contradicting the units.'
      : 'GROUNDING (required): Every section MUST be drawn from the content units. Do NOT invent unsupported facts.';

  const system = [
    'You are an instructional designer generating a tutorial as STRUCTURED JSON.',
    groundingRule,
    'Output ONLY a JSON array of "part" objects. No prose, no markdown fences.',
    'Keep rich-text bodies concise (2–5 short sentences).',
    'Allowed part shapes:',
    '  {"type":"rich-text","label":string,"heading":string|null,"subheads":string[]|null,"body":string}',
    '  {"type":"question","label":string,"prompt":string,"options":[four strings],"correct":integer 0-3,"exp":string,"hints":[four strings]}',
    mediaList.length ? '  {"type":"media","ref":string}' : '',
    'Number questions sequentially: Question 1, Question 2, …',
    'Follow author hint settings in the user message for how many progressive hints to include (or none).',
  ].filter(Boolean).join('\n');

  const hintOptsLegacy = resolveHintSettings(c);
  const user = [
    `Tutorial title: ${title || '(untitled)'}`,
    `Learning objective: ${c.obj || '(none given)'}`,
    `Overall topic: ${c.topic || title || '(none given)'}`,
    `Audience: ${c.aud || 'High school'}`,
    `Level: ${c.lvl || 'Basic'}`,
    `Progression: ${c.prog || 'Linear build-up'}`,
    `Depth per section: ${c.dpth || 'Standard'}`,
    `Pass mark (all checks combined): ${c.pass || '70%'}`,
    `Progressive hints: ${hintOptsLegacy.enabled ? `ON — exactly ${hintOptsLegacy.count} per question` : 'OFF — set hints to []'}`,
    `AI extras beyond source: ${allowExtraLegacy ? 'ON' : 'OFF'}`,
    authorPrompt ? `\nAuthor's prompt / description:\n${authorPrompt}` : '',
    '',
    'Content units to build from:',
    extractLines,
    mediaList.length ? `\nMedia: ${mediaList.map((m) => m.ref).join(', ')}` : '',
    '',
    'Produce, IN ORDER:',
    '1. Introduction rich-text with heading "Introduction".',
    `2. Exactly ${secs} sections. For EACH section in order: rich-text with heading "Section N: <title>" and optional subheads${wex ? ', then a worked-example rich-text' : ''}${chks > 0 ? `, then IMMEDIATELY ${chks} question(s) testing THAT section only — before the next section heading` : ''}.`,
    excpts > 0 && hasExtracts ? `3. ${excpts} source-excerpt rich-text part(s) (inside their section, before that section's questions).` : '3. (no source excerpts)',
    end === 'End quiz' ? '4. End with 2-3 questions (only if not already placing checks after each section).'
      : end === 'End assignment' ? '4. End with one assignment rich-text.'
      : end === 'Recap only' ? '4. End with Recap rich-text (heading Recap).'
      : '4. (no closing part)',
    chks > 0 ? 'Do NOT gather all questions at the end; each check must follow the section it tests.' : '',
    '',
    'Return the JSON array now.',
  ].filter(Boolean).join('\n');

  return { system, user, secs };
}

const ALLOWED_TYPES = new Set(['rich-text', 'concept-card', 'question']);

function normalizePart(raw, idx) {
  if (!raw || typeof raw !== 'object') return null;
  const id = `g${Date.now()}_${idx}`;
  if (raw.type === 'media') {
    return typeof raw.ref === 'string' && raw.ref ? { id, type: 'media', ref: raw.ref, label: 'Media' } : null;
  }
  if (!ALLOWED_TYPES.has(raw.type)) return null;
  const label = typeof raw.label === 'string' ? raw.label : '';
  if (raw.type === 'rich-text') {
    if (typeof raw.body !== 'string' || !raw.body.trim()) return null;
    const heading = typeof raw.heading === 'string' && raw.heading.trim() ? raw.heading.trim() : undefined;
    const subheads = Array.isArray(raw.subheads)
      ? raw.subheads.map((s) => String(s || '').trim()).filter(Boolean)
      : undefined;
    return {
      id, type: 'rich-text', label: label || heading || 'Section', body: raw.body,
      heading, subheads: subheads?.length ? subheads : undefined,
    };
  }
  if (raw.type === 'concept-card') {
    return { id, type: 'concept-card', label, concept: String(raw.concept || ''), plain: String(raw.plain || ''), misc: String(raw.misc || '') };
  }
  const options = Array.isArray(raw.options) ? raw.options.slice(0, 4).map(String) : [];
  while (options.length < 4) options.push(`Option ${options.length + 1}`);
  let correct = Number(raw.correct);
  if (!Number.isInteger(correct) || correct < 0 || correct > 3) correct = 0;
  const hints = Array.isArray(raw.hints)
    ? raw.hints.map((h) => String(h || '').trim()).filter(Boolean)
    : (typeof raw.hint === 'string' && raw.hint.trim() ? [raw.hint.trim()] : []);
  return {
    id, type: 'question', label, prompt: String(raw.prompt || ''), options, correct,
    exp: String(raw.exp || ''),
    hints,
  };
}

function renumberQuestionLabels(parts) {
  let n = 0;
  return parts.map((p) => {
    if (p.type !== 'question') return p;
    n += 1;
    return { ...p, label: `Question ${n}` };
  });
}

/* ─── Tutorial: edit a single block ───────────────────────────────── */

function shapeFor(type) {
  if (type === 'rich-text') return '{"type":"rich-text","label":string,"body":string}';
  if (type === 'concept-card') return '{"type":"concept-card","label":string,"concept":string,"plain":string,"misc":string}';
  return '{"type":"question","label":string,"prompt":string,"options":[four strings],"correct":integer 0-3,"exp":string,"hints":[four strings]}';
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
    '{"question":string,"type":"multiple-choice"|"true-false"|"multi-select"|"short-answer"|"scenario","options":string[]|null,"correct":number|null,"correctIndices":number[]|null,"sampleAnswer":string|null,"explanation":string|null,"hints":[four progressive hint strings],"cognitiveLevel":string,"difficulty":"easy"|"medium"|"hard"}',
    'Rules:',
    '- multiple-choice / scenario: 4 options, correct = 0-based index of the right option.',
    '- true-false: options MUST be ["True","False"], correct = 0 or 1.',
    '- multi-select: 4 options, correctIndices = array of all correct 0-based indices (at least 2). Set correct to null.',
    '- short-answer: options null, correct null, sampleAnswer = a concise acceptable answer for grading guidance.',
    '- scenario: longer realistic stem grounded in the material, then 4 options like multiple-choice.',
    writeExplanations
      ? '- Write a clear per-question explanation for every item (why the right answer is right; briefly why common wrong answers fail).'
      : '- Set explanation to null/empty on every item — per-question explanations are OFF.',
    '- Every question MUST include exactly 4 progressive "hints". Hint 1 is gentle; later hints are more specific. Include at least one hint that tells the learner which part of the source/passage to re-read. Never reveal the correct option text or index.',
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
  out.hints = ensureFourHints(raw.hints, {
    explanation: out.explanation,
    singleHint: out.hint,
  });

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
    'Shape: {"question":string,"type":"multiple-choice"|"true-false"|"multi-select"|"short-answer"|"scenario","options":string[]|null,"correct":number|null,"correctIndices":number[]|null,"sampleAnswer":string|null,"explanation":string|null,"hint":string|null,"hints":[four progressive hint strings]|null,"cognitiveLevel":string|null,"difficulty":"easy"|"medium"|"hard"|null}',
    'Keep type unless the instruction asks to change it. Preserve accuracy.',
    'hints = exactly 4 progressive learner cues unlocked after wrong attempts; at least one should point back to the relevant passage/section. Never reveal the correct option.',
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

  /* ---- Tutorial: document-level markup flags (review list) ---- */
  if (method === 'POST' && path === '/api/tutorials/suggest-markup-flags') {
    const body = await readJson(req);
    let items = [];
    if (Array.isArray(body.sentences)) {
      items = body.sentences.map((s) => {
        if (s && typeof s === 'object') {
          return { text: String(s.text || ''), page: Number(s.page) || 1 };
        }
        return { text: String(s || ''), page: 1 };
      }).filter((it) => it.text.trim());
    }
    if (items.length === 0) return send(res, 400, { code: 'no_sentences', message: 'No sentences to analyze.' });
    try {
      const result = await suggestMarkupFlags(items, {
        instruction: body.instruction,
        objective: body.objective,
        title: body.title,
      });
      return send(res, 200, result);
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

  /* ---- Tutorial: build clustered knowledge base from markup ---- */
  if (method === 'POST' && path === '/api/tutorials/extract-knowledge') {
    const body = await readJson(req);
    try {
      let kb = buildClusteredKnowledgeBase({
        highlights: body?.highlights,
        extracts: body?.extracts,
        shapeIntent: body?.shapeIntent,
        objective: body?.objective,
        topic: body?.topic,
      });
      if (body?.refineWithLlm !== false && kb.units.length) {
        kb = await refineClustersWithLlm(kb, {
          objective: body?.objective,
          topic: body?.topic,
          shapeIntent: body?.shapeIntent,
        });
      }
      if (!kb.units.length) {
        return send(res, 422, {
          code: 'no_units',
          message: 'No content units could be built from your markup. Tag Use/Support sentences and try again.',
        });
      }
      return send(res, 200, { knowledgeBase: kb });
    } catch (e) {
      const status = e instanceof LlmError ? e.status : 500;
      return send(res, status, { code: e.code || 'error', message: e.message });
    }
  }

  /* ---- Tutorial: generate (real LLM, streamed as SSE) ---- */
  if (method === 'POST' && path === '/api/tutorials/generate') {
    const body = await readJson(req);
    sseStart(res);
    try {
      const hasPlans = Array.isArray(body?.sectionPlans) && body.sectionPlans.length > 0;
      sseSend(res, {
        type: 'progress',
        message: hasPlans
          ? 'Mapping template sections to source clusters…'
          : 'Reading your extracts and settings…',
      });
      const { system, user, secs } = buildGeneratePrompt(body);
      const sectionCount = secs || (typeof body?.config?.secs === 'number' ? body.config.secs : 3);
      const maxTokens = sectionCount >= 6 ? 16384 : sectionCount >= 4 ? 12288 : 8192;
      sseSend(res, { type: 'progress', message: 'Drafting the tutorial from your template and clusters…' });
      const raw = await callAnthropic({ system, user, maxTokens });
      const parsed = extractJson(raw);
      const arr = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' ? [parsed] : []);
      let parts = arr.map((p, i) => normalizePart(p, i)).filter(Boolean);
      const assess = body?.template?.assessmentPlacement || 'after_each_section';
      const chks = typeof body?.config?.chks === 'number' ? body.config.chks : 1;
      parts = orderTutorialParts(parts, { assessmentPlacement: assess, checksPerSection: chks });
      const hintOpts = resolveHintSettings(body?.config || {});
      parts = attachHintsToQuestionParts(parts, hintOpts);
      parts = renumberQuestionLabels(parts);
      if (parts.length === 0) throw new LlmError(502, 'llm_no_parts', 'The model did not return any usable parts. Try again.');
      sseSend(res, { type: 'progress', message: `Assembling ${parts.length} parts…` });
      for (const part of parts) {
        sseSend(res, { type: 'part', part });
        await sleep(80);
      }
      sseSend(res, { type: 'done', count: parts.length });
    } catch (e) {
      sseSend(res, { type: 'error', code: e.code || 'error', message: e.message || 'Generation failed.' });
    }
    return sseDone(res);
  }

  /* ---- Course-dev Object Assistant (SSE) ---- */
  if (method === 'POST' && path === '/api/assistant/turn') {
    const body = await readJson(req);
    const message = String(body?.message || '').trim();
    const context = body?.context;
    const selection = body?.selection || context?.selection || { kind: 'none' };
    const history = Array.isArray(body?.history) ? body.history.slice(-10) : [];
    const quickAction = body?.quickAction || null;

    sseStart(res);
    try {
      if (!message) throw new LlmError(400, 'no_message', 'Ask a question or describe an edit.');
      if (!context || !context.objectId) {
        throw new LlmError(400, 'no_context', 'No object context — open a learning object in the editor.');
      }

      sseSend(res, { type: 'status', message: 'Reading this object’s context…' });

      const blocks = Array.isArray(context.blocks) ? context.blocks : [];
      const blockLines = blocks.map((b, i) => {
        const c = b.content && typeof b.content === 'object' ? JSON.stringify(b.content).slice(0, 900) : '';
        return `[${b.id}] #${i + 1} type=${b.type}${b.label ? ` label="${b.label}"` : ''}\n${c}`;
      }).join('\n\n');

      const prov = context.provenance || {};
      const units = (prov.knowledgeBase?.units || []).slice(0, 40).map((u) =>
        `- (${u.id}) [${u.kind}] ${String(u.text || '').slice(0, 220)}${u.from ? ` — ${u.from}` : ''}`,
      ).join('\n');
      const clusters = (prov.knowledgeBase?.clusters || []).map((c) =>
        `- ${c.id}: ${c.name} → ${(c.unitIds || []).join(', ')}`,
      ).join('\n');

      const selLine = selection?.kind === 'block'
        ? `Selected block: ${selection.blockId}`
        : selection?.kind === 'block_range'
          ? `Selected range in ${selection.blockId}: "${String(selection.selectedText || '').slice(0, 280)}"`
          : selection?.kind === 'multi_block'
            ? `Selected blocks: ${(selection.blockIds || []).join(', ')}`
            : 'Selection: whole object (none specific)';

      const meta = context.metadata || {};
      const system = [
        'You are the LAIC course-developer Object Assistant — a co-author for ONE open learning object.',
        'CRITICAL RULES:',
        '- Use ONLY the provided object context (blocks, metadata, extracts/clusters). Never invent source citations.',
        '- Never claim you already edited the object. Edits must be proposals the developer accepts.',
        '- If the request is outside this object, refuse and explain.',
        '- If ambiguous, ask ONE concise clarifying question (mode=clarify) and omit proposal.',
        '- Cite block ids like [blk-…] when referencing content.',
        '- Prefer scoping edits to the current selection.',
        '',
        'Return ONLY JSON (no markdown fences):',
        '{',
        '  "mode": "answer" | "clarify" | "proposal",',
        '  "message": string,',
        '  "citations": [{"kind":"block"|"extract"|"cluster","id":string,"label":string}],',
        '  "proposal": null | {',
        '    "title": string,',
        '    "diffs": [{',
        '      "kind": "text"|"structural"|"metadata",',
        '      "summary": string,',
        '      "beforeText": string|null,',
        '      "afterText": string|null,',
        '      "blockId": string|null,',
        '      "action": EditAction',
        '    }]',
        '  }',
        '}',
        'EditAction types: update_block {type,blockId,patch,reason}, update_block_range {type,blockId,start,end,replacement,field?,reason},',
        'add_block {type,atIndex,blockType,content,label?,reason}, delete_block {type,blockId,reason},',
        'reorder_blocks {type,order,reason}, convert_block {type,blockId,toType,content,reason},',
        'update_metadata {type,patch,reason}, batch {type,actions,reason}.',
        'For tutorial rich-text patches use fields: body, heading, label, subheads.',
        'For questions: prompt, options (4 strings), correct (0-3), exp, label.',
        'For add_block question content: {question,options,correct,explanation}. For rich-text: {text,heading}.',
      ].join('\n');

      const historyLines = history
        .filter((h) => h && (h.role === 'user' || h.role === 'assistant') && h.content)
        .map((h) => `${h.role}: ${h.content}`)
        .join('\n');

      const user = [
        `Object: ${context.title || '(untitled)'} (${context.objectType}) id=${context.objectId} status=${context.status || 'draft'}`,
        `Objective: ${meta.objective || '(none)'}`,
        `Audience: ${meta.audience || '—'} · Level: ${meta.level || '—'} · Voice: ${meta.voice || '—'} · Topic: ${meta.topic || '—'}`,
        `Template: ${meta.templateId || '—'}`,
        selLine,
        quickAction ? `Quick action: ${quickAction}` : '',
        '',
        `Provenance: sources≈${prov.sourceCount || 0}, highlights=${prov.highlightCount || 0}, extracts=${prov.extractCount || 0}, mode=${prov.srcMode || '—'}`,
        clusters ? `Clusters:\n${clusters}` : '',
        units ? `Source units:\n${units}` : '(no extract units)',
        '',
        'BLOCKS:',
        blockLines || '(no blocks)',
        '',
        historyLines ? `Recent conversation:\n${historyLines}\n` : '',
        `Developer message: ${message}`,
        '',
        'Respond with the JSON object now.',
      ].filter(Boolean).join('\n');

      sseSend(res, { type: 'status', message: 'Thinking…' });
      const raw = await callAnthropic({ system, user, maxTokens: 4096 });
      let parsed;
      try {
        parsed = extractJson(raw);
      } catch {
        parsed = null;
      }

      const msgId = `am-${Date.now()}`;
      let mode = parsed?.mode;
      let text = typeof parsed?.message === 'string' ? parsed.message.trim() : '';
      if (!text) {
        // Model returned prose — use as answer, no proposal
        text = String(raw || '').replace(/^```[\s\S]*?```$/m, '').trim().slice(0, 4000)
          || 'I could not form a grounded reply from this object’s context. Try a more specific question.';
        mode = 'answer';
      }
      if (!['answer', 'clarify', 'proposal'].includes(mode)) mode = parsed?.proposal ? 'proposal' : 'answer';

      // Stream tokens for UX
      const chunkSize = 24;
      for (let i = 0; i < text.length; i += chunkSize) {
        sseSend(res, { type: 'token', text: text.slice(i, i + chunkSize) });
        await sleep(12);
      }

      const citations = Array.isArray(parsed?.citations)
        ? parsed.citations
          .filter((c) => c && c.id && ['block', 'extract', 'cluster', 'highlight'].includes(c.kind))
          .map((c) => ({ kind: c.kind, id: String(c.id), label: c.label ? String(c.label) : undefined }))
        : [];

      const messageObj = {
        id: msgId,
        role: 'assistant',
        content: text,
        at: Date.now(),
        citations,
        proposalIds: [],
      };

      let proposal = null;
      if (mode === 'proposal' && parsed?.proposal && Array.isArray(parsed.proposal.diffs) && parsed.proposal.diffs.length) {
        const propId = `prop-${Date.now()}`;
        const diffs = parsed.proposal.diffs
          .filter((d) => d && d.action && d.action.type)
          .map((d, i) => ({
            id: `diff-${Date.now()}-${i}`,
            kind: ['text', 'structural', 'metadata', 'batch_item'].includes(d.kind) ? d.kind : 'text',
            summary: String(d.summary || 'Proposed change'),
            beforeText: d.beforeText != null ? String(d.beforeText) : undefined,
            afterText: d.afterText != null ? String(d.afterText) : undefined,
            blockId: d.blockId != null ? String(d.blockId) : (d.action?.blockId || undefined),
            action: d.action,
          }));
        if (diffs.length) {
          proposal = {
            id: propId,
            messageId: msgId,
            status: 'pending',
            title: String(parsed.proposal.title || 'Proposed edits'),
            diffs,
            createdAt: Date.now(),
          };
          messageObj.proposalIds = [propId];
        }
      }

      sseSend(res, { type: 'message', message: messageObj });
      if (proposal) sseSend(res, { type: 'proposal', proposal });
      sseSend(res, { type: 'done' });
    } catch (e) {
      sseSend(res, { type: 'error', code: e.code || 'error', message: e.message || 'Assistant failed.' });
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
  console.log('Tutorial: POST /api/tutorials/suggest-highlights · POST /api/tutorials/suggest-markup-flags · POST /api/tutorials/extract-knowledge · POST /api/tutorials/generate (SSE)');
  console.log('Ask AI: POST /api/ask');
  console.log('Assistant: POST /api/assistant/turn (SSE)');
  console.log('Sources stub: GET/POST /api/sources · GET /api/collections\n');
});
