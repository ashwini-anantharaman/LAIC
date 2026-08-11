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
import { attachSourcesToQuestionParts, normalizeMcqSources } from '../src/lib/mcqSources.js';
import { resolveTutorialWordTarget } from '../src/lib/tutorialPages.js';

const PYTHON = process.env.PYTHON || 'python3';

const PORT = process.env.PORT ? Number(process.env.PORT) : 8000;
const READY_AFTER_MS = 6000;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const LLM_MODEL = process.env.LLM_MODEL || 'claude-sonnet-5';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

/* ─── Course-Wizard Step 1 source stubs (unchanged) ───────────────── */

/** @type {Array<Record<string, any>>} */
let sources = [];
const collections = [];

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

  // Complete object with trailing prose, or truncated object.
  if (s[0] === '{') {
    const objs = extractCompleteObjects(s);
    if (objs.length === 1) return objs[0];
    if (objs.length > 1) return objs[0];
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

/** Alphanumeric floor — keep short titles/headings, drop page-number junk. */
const MIN_UNIT_ALNUM = 2;

function splitPunctuatedBlock(block) {
  const normalized = String(block || '').replace(/[ \t]+/g, ' ').trim();
  if (!normalized) return [];
  return (normalized.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) || [normalized])
    .map((s) => s.trim())
    .filter((s) => s.replace(/[^A-Za-z0-9]/g, '').length >= MIN_UNIT_ALNUM);
}

/**
 * Split text into markup units (sentences + titles/headings).
 * Newlines are unit boundaries so short headings stay selectable in Markup.
 */
function toSentences(text) {
  const raw = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return [];
  const blocks = raw.split(/\n+/).map((b) => b.trim()).filter(Boolean);
  const out = [];
  if (blocks.length <= 1) {
    out.push(...splitPunctuatedBlock(raw.replace(/\s+/g, ' ')));
  } else {
    for (const block of blocks) {
      const alnum = block.replace(/[^A-Za-z0-9]/g, '').length;
      if (alnum < MIN_UNIT_ALNUM) continue;
      // Short / title-like lines without terminal punctuation → keep whole.
      if (alnum <= 80 && !/[.!?]/.test(block)) {
        out.push(block.replace(/\s+/g, ' ').trim());
        continue;
      }
      out.push(...splitPunctuatedBlock(block));
    }
  }
  if (out.length >= 2) return out;
  // Poorly-punctuated (auto captions): chunk into ~22-word pseudo-sentences.
  const norm = raw.replace(/\s+/g, ' ').trim();
  const words = norm.split(' ');
  const chunks = [];
  for (let i = 0; i < words.length; i += 22) chunks.push(words.slice(i, i + 22).join(' '));
  return chunks.filter((c) => c.replace(/[^A-Za-z0-9]/g, '').length >= MIN_UNIT_ALNUM);
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

/** Timed caption chunks from yt-dlp json3 (merged into ~chunkSec windows). */
function json3ToSegments(raw, chunkSec = 8) {
  let data;
  try { data = JSON.parse(raw); } catch { return []; }
  const rawSegs = [];
  for (const ev of data.events || []) {
    if (ev.tStartMs == null) continue;
    const text = (ev.segs || []).map((s) => s.utf8 || '').join('').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const start = Number(ev.tStartMs) / 1000;
    const end = start + (Number(ev.dDurationMs) || 0) / 1000;
    rawSegs.push({ start, end: end > start ? end : start + 1, text });
  }
  if (!rawSegs.length) return [];
  const merged = [];
  let cur = { start: rawSegs[0].start, end: rawSegs[0].end, text: rawSegs[0].text };
  for (let i = 1; i < rawSegs.length; i++) {
    const s = rawSegs[i];
    if (s.start - cur.start < chunkSec && (cur.text + ' ' + s.text).length < 420) {
      cur.end = Math.max(cur.end, s.end);
      cur.text = `${cur.text} ${s.text}`.replace(/\s+/g, ' ').trim();
    } else {
      merged.push(cur);
      cur = { start: s.start, end: s.end, text: s.text };
    }
  }
  merged.push(cur);
  return merged.map((s, i) => ({
    id: `seg-${i + 1}`,
    start: Math.round(s.start * 10) / 10,
    end: Math.round(s.end * 10) / 10,
    text: s.text,
  }));
}

/**
 * Serverless-friendly transcript fetch — YouTube InnerTube player API, no
 * yt-dlp needed. Used on Vercel and as a fallback when yt_dlp is missing.
 */
async function fetchYoutubeTranscriptInnertube(id) {
  // The IOS player client returns caption URLs that work without a
  // proof-of-origin token, and honors fmt=json3. (The plain web timedtext
  // URLs return empty bodies without a botguard token.)
  const CLIENTS = [
    {
      client: {
        clientName: 'IOS', clientVersion: '20.10.4', deviceMake: 'Apple',
        deviceModel: 'iPhone16,2', osName: 'iPhone', osVersion: '18.3.2.22D82', hl: 'en',
      },
      ua: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
    },
    {
      client: { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 30, hl: 'en' },
      ua: 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip',
    },
  ];
  let lastErr = null;
  for (const { client, ua } of CLIENTS) {
    try {
      const res = await fetch('https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': ua },
        body: JSON.stringify({ videoId: id, context: { client } }),
      });
      if (!res.ok) { lastErr = new Error(`player API ${res.status}`); continue; }
      const player = await res.json();
      if (player?.playabilityStatus?.status && player.playabilityStatus.status !== 'OK') {
        lastErr = new Error(`video not playable (${player.playabilityStatus.status})`);
        continue;
      }
      const title = String(player?.videoDetails?.title || `YouTube video ${id}`);
      const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      if (!tracks.length) {
        lastErr = new LlmError(422, 'no_captions', 'No transcript is available for this video (captions may be disabled).');
        continue;
      }
      const track = tracks.find((t) => String(t.languageCode || '').startsWith('en')) || tracks[0];
      const sep = String(track.baseUrl).includes('?') ? '&' : '?';
      const subRes = await fetch(`${track.baseUrl}${sep}fmt=json3`, { headers: { 'User-Agent': ua } });
      if (!subRes.ok) { lastErr = new Error(`captions ${subRes.status}`); continue; }
      const raw = await subRes.text();
      if (!raw || raw.trimStart().startsWith('<')) { lastErr = new Error('captions came back in an unexpected format'); continue; }
      const transcript = json3ToText(raw);
      if (!transcript) { lastErr = new LlmError(422, 'empty_transcript', 'The transcript came back empty.'); continue; }
      return { title, videoId: id, sentences: toSentences(transcript), segments: json3ToSegments(raw) };
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr instanceof LlmError) throw lastErr;
  throw new LlmError(502, 'yt_fetch', `Could not fetch the transcript from YouTube${lastErr ? ` (${lastErr.message})` : ''}.`);
}

async function fetchYoutubeTranscript(url) {
  const id = parseVideoId(url);
  if (!id) throw new LlmError(400, 'bad_url', "That doesn't look like a YouTube link.");

  // Serverless (Vercel) has no python/yt-dlp — go straight to InnerTube.
  if (process.env.VERCEL) return fetchYoutubeTranscriptInnertube(id);

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
        // yt-dlp missing — fall back to the dependency-free InnerTube path.
        return await fetchYoutubeTranscriptInnertube(id);
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
    const segments = json3ToSegments(raw);
    return { title, videoId: id, sentences: toSentences(transcript), segments };
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function buildVideoScriptPrompt(body) {
  const { title, config, extracts, prompt, transcriptSegments, videoTitle } = body || {};
  const c = config || {};
  const num = (v, d) => (typeof v === 'number' ? v : Number(v) || d);
  const ncp = Math.max(1, Math.min(12, num(c.ncp, 4)));
  const extractLines = extractLinesFrom(extracts);
  const directiveBlock = formatAuthorDirectivesBlock(collectAuthorDirectives(body));
  const segs = Array.isArray(transcriptSegments) ? transcriptSegments : [];
  const durationHint = segs.length
    ? Math.max(...segs.map((s) => Number(s.end || s.start) || 0))
    : 0;
  const timedLines = segs.slice(0, 80).map((s) =>
    `[${fmtClockServer(s.start)}${s.end != null ? `–${fmtClockServer(s.end)}` : ''}] ${s.text}`,
  ).join('\n');

  const system = [
    'You generate an interactive VIDEO LESSON (Edpuzzle-style) as STRUCTURED JSON.',
    'Place comprehension checkpoints along a YouTube video using its timed transcript.',
    'Output ONLY a JSON object. No prose, no markdown fences.',
    'Shape:',
    '{"checkpoints":[{"time":number,"question":string,"options":[string,string,string,string],"correct":number,"explanation":string}]}',
    'Rules:',
    `- Produce EXACTLY ${ncp} checkpoints.`,
    '- time is seconds from video start (number). Spread them through the video — not all near the start.',
    '- Prefer pausing shortly AFTER a key idea is spoken (use transcript times). Leave ~8+ seconds between checkpoints.',
    '- Never place a checkpoint in the first 5 seconds or in the last 3 seconds of the video.',
    '- Each question is multiple-choice with exactly 4 options; correct is the 0-based index of the right option.',
    '- Questions MUST be answerable from what was said in the video up to that timestamp (and any marked-up extracts).',
    '- Do not invent facts outside the transcript / extracts.',
    '- Write a short explanation for each question.',
  ].join('\n');

  const user = [
    `Lesson title: ${title || videoTitle || '(untitled)'}`,
    `Video title: ${videoTitle || '(unknown)'}`,
    durationHint > 0 ? `Approx video length from captions: ${Math.round(durationHint)}s` : '',
    '--- Define settings ---',
    `Learning objective: ${c.obj || '(none)'}`,
    `Audience: ${c.aud || 'High school'}`,
    `Level: ${c.lvl || 'Basic'}`,
    `Number of checkpoints: ${ncp}`,
    prompt ? `\nAuthor prompt:\n${prompt}` : '',
    directiveBlock,
    '',
    '--- Timed transcript ---',
    timedLines || '(no timed captions — invent plausible evenly-spaced times and ground questions in extracts/prompt)',
    '',
    '--- Marked-up extracts (optional extra grounding) ---',
    extractLines,
    '',
    'Return the JSON object now.',
  ].filter(Boolean).join('\n');

  return { system, user, ncp };
}

function fmtClockServer(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function normalizeVideoScriptCheckpoint(raw, idx, durationHint) {
  if (!raw || typeof raw !== 'object') return null;
  const question = String(raw.question || raw.stem || '').trim();
  if (!question) return null;
  const options = Array.isArray(raw.options)
    ? raw.options.map((o) => String(o || '').trim()).filter(Boolean)
    : [];
  if (options.length < 2) return null;
  while (options.length < 4) options.push(`Option ${options.length + 1}`);
  const correct = Math.max(0, Math.min(options.length - 1, Number(raw.correct) || 0));
  let time = Number(raw.time);
  if (!Number.isFinite(time) || time < 0) time = (idx + 1) * 30;
  if (durationHint > 10) {
    time = Math.min(Math.max(5, time), durationHint - 3);
  } else {
    time = Math.max(5, time);
  }
  return {
    id: `cp-${Date.now()}-${idx}`,
    time: Math.round(time * 10) / 10,
    question: {
      question,
      type: 'multiple-choice',
      options: options.slice(0, 4),
      correct,
      explanation: String(raw.explanation || '').trim() || undefined,
    },
  };
}

/* ─── Tutorial: website page → sentences ──────────────────────────── */

const WEB_MAX_BYTES = 2_000_000;
const WEB_TIMEOUT_MS = 20_000;
const WEB_MAX_REDIRECTS = 3;

function isPrivateHostname(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  // Block obvious IP literals (IPv4 + common private ranges; also block all raw IPs for safety)
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const parts = h.split('.').map(Number);
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    return true; // disallow any bare IPv4 as fetch target
  }
  if (h.includes(':')) return true; // IPv6 literals
  return false;
}

function assertPublicHttpUrl(raw) {
  let u;
  try {
    u = new URL(String(raw || '').trim());
  } catch {
    throw new LlmError(400, 'bad_url', 'Enter a valid website URL (https://…).');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new LlmError(400, 'bad_url', 'Only http:// and https:// website links are supported.');
  }
  if (isPrivateHostname(u.hostname)) {
    throw new LlmError(400, 'private_url', 'That link points to a private or local address and cannot be fetched.');
  }
  return u;
}

function decodeHtmlEntities(s) {
  return String(s || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCharCode(code) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const code = parseInt(h, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : '';
    });
}

/** Prefer article/main/body content; strip chrome. */
function extractMainHtmlChunk(html) {
  let h = String(html || '');
  h = h
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  let chunk = h;
  const article = h.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  const main = h.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (article?.[1] && article[1].replace(/<[^>]+>/g, ' ').trim().length > 200) chunk = article[1];
  else if (main?.[1] && main[1].replace(/<[^>]+>/g, ' ').trim().length > 200) chunk = main[1];
  else {
    const body = h.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
    if (body?.[1]) chunk = body[1];
  }

  return chunk
    // Unwrap <header> so article titles/h1 stay markable; drop other chrome.
    .replace(/<\/?header\b[^>]*>/gi, ' ')
    .replace(/<(nav|footer|aside|form|iframe|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(nav|footer|aside|form|iframe|svg)\b[^>]*\/>/gi, ' ');
}

/**
 * Sanitize article HTML for safe Markup display — keep structure/formatting
 * (headings, lists, emphasis, links, tables) and drop scripts/events/styles.
 */
function sanitizeArticleHtml(html) {
  let chunk = extractMainHtmlChunk(html);
  // Drop residual dangerous / non-content tags (keep their text where sensible)
  chunk = chunk
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<button[\s\S]*?<\/button>/gi, ' ')
    .replace(/<\/?(?:object|embed|applet|link|meta|base|input|textarea|select|option)[^>]*>/gi, ' ');

  // Normalize voids
  chunk = chunk.replace(/<br\s*\/?>/gi, '<br/>').replace(/<hr\s*\/?>/gi, '<hr/>');

  // Only allow a formatting allowlist; unwrap everything else (keep children).
  const allowed = new Set([
    'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 's', 'mark',
    'blockquote', 'pre', 'code', 'a', 'span', 'div', 'section',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    'figure', 'figcaption', 'img', 'sub', 'sup', 'dl', 'dt', 'dd',
  ]);

  chunk = chunk.replace(/<\/?([a-zA-Z0-9]+)(\s[^>]*)?>/g, (full, rawName, attrs = '') => {
    const name = String(rawName || '').toLowerCase();
    const closing = full.startsWith('</');
    if (!allowed.has(name)) return closing ? '' : '';
    if (closing) return `</${name}>`;

    if (name === 'br' || name === 'hr') return `<${name}/>`;

    const attr = (key) => {
      const m = attrs.match(new RegExp(`\\b${key}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
      return m ? (m[2] ?? m[3] ?? m[4] ?? '') : '';
    };

    if (name === 'a') {
      const safe = String(attr('href') || '').trim();
      if (/^https?:\/\//i.test(safe) || safe.startsWith('/') || safe.startsWith('#') || safe.startsWith('mailto:')) {
        return `<a href="${safe.replace(/"/g, '&quot;')}" rel="noopener noreferrer" target="_blank">`;
      }
      return '<a>';
    }

    if (name === 'img') {
      const srcVal = String(attr('src') || '').trim();
      const altVal = String(attr('alt') || '').trim();
      if (!/^https?:\/\//i.test(srcVal) && !srcVal.startsWith('data:image/')) return '';
      return `<img src="${srcVal.replace(/"/g, '&quot;')}" alt="${altVal.replace(/"/g, '&quot;')}" loading="lazy"/>`;
    }

    // Strip all attributes / event handlers on other tags
    return `<${name}>`;
  });

  // Collapse empty wrappers noise lightly
  chunk = chunk
    .replace(/(<p>\s*<\/p>)+/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Cap size for Markup
  if (chunk.length > 200_000) chunk = chunk.slice(0, 200_000);
  return chunk;
}

/** Lightweight HTML → plain text (no extra deps). Prefer article/main when present. */
function htmlToPlainText(html) {
  let chunk = extractMainHtmlChunk(html);

  chunk = chunk
    .replace(/<\/(p|div|h[1-6]|li|tr|br|blockquote|section|td|th)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  return decodeHtmlEntities(chunk)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function extractHtmlTitle(html, fallbackHost) {
  const m = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (m?.[1]) {
    const t = decodeHtmlEntities(m[1].replace(/\s+/g, ' ').trim());
    if (t) return t.slice(0, 200);
  }
  const og = String(html || '').match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || String(html || '').match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  if (og?.[1]) return decodeHtmlEntities(og[1]).trim().slice(0, 200);
  return fallbackHost || 'Web page';
}

/* ─── Website image harvesting (authoring image picker) ──────────── */

const WEB_IMAGE_MAX = 40;
const IMG_MAX_BYTES = 6_000_000;
/** Src substrings that are almost never content images. */
const IMG_SKIP_SRC = /(sprite|favicon|\/icons?\/|icon-|-icon|logo|avatar|emoji|badge|pixel|tracker|tracking|spacer|blank\.|1x1|advert|banner-ad|share-|widget)/i;

/** Pick the largest candidate from a srcset attribute. */
function pickFromSrcset(srcset) {
  let best = '';
  let bestW = -1;
  for (const part of String(srcset || '').split(',')) {
    const bits = part.trim().split(/\s+/);
    if (!bits[0]) continue;
    const wm = bits[1] && bits[1].match(/^(\d+)w$/i);
    const w = wm ? Number(wm[1]) : 0;
    if (w >= bestW) { bestW = w; best = bits[0]; }
  }
  return best;
}

/**
 * Harvest content images from a fetched page so course developers can place
 * them while authoring (instead of screenshotting manually). Prefers the
 * article/main chunk; pairs <figure> images with their captions; resolves
 * relative and lazy-load srcs; filters icons/pixels/logos.
 */
function extractWebsiteImages(html, baseUrl) {
  const stripped = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  const images = [];
  const seen = new Set();
  const cleanText = (s) => decodeHtmlEntities(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  const attrOf = (attrs, key) => {
    const m = String(attrs || '').match(new RegExp(`\\b${key}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
    return m ? (m[2] ?? m[3] ?? m[4] ?? '') : '';
  };

  const pushTag = (tag, caption) => {
    if (images.length >= WEB_IMAGE_MAX) return;
    const w = Number(attrOf(tag, 'width')) || 0;
    const h = Number(attrOf(tag, 'height')) || 0;
    if ((w && w < 80) || (h && h < 80)) return; // icons / tracking pixels
    const raw = pickFromSrcset(attrOf(tag, 'srcset') || attrOf(tag, 'data-srcset'))
      || attrOf(tag, 'src')
      || attrOf(tag, 'data-src')
      || attrOf(tag, 'data-lazy-src')
      || attrOf(tag, 'data-original');
    let src = decodeHtmlEntities(String(raw || '').trim());
    if (!src) return;
    if (src.startsWith('data:')) {
      // keep only substantial inline images; lazy-load placeholders are tiny
      if (!src.startsWith('data:image/') || src.length < 4096) return;
    } else {
      try { src = new URL(src, baseUrl).toString(); } catch { return; }
      if (!/^https?:\/\//i.test(src)) return;
      if (/\.svg([?#]|$)/i.test(src)) return;
      if (IMG_SKIP_SRC.test(src)) return;
    }
    if (seen.has(src)) return;
    seen.add(src);
    const alt = cleanText(attrOf(tag, 'alt')).slice(0, 300);
    const cap = cleanText(caption).slice(0, 300);
    images.push({ src, alt: alt || undefined, caption: cap || undefined });
  };

  // Prefer the article/main chunk; sweep the whole page only if it's sparse.
  for (const scope of [extractMainHtmlChunk(stripped), stripped]) {
    // 1) figures first — they carry captions
    for (const fig of scope.match(/<figure\b[\s\S]*?<\/figure>/gi) || []) {
      const cap = fig.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i)?.[1] || '';
      for (const tag of fig.match(/<img\b[^>]*>/gi) || []) pushTag(tag, cap);
    }
    // 2) remaining images (dedup via `seen`)
    for (const tag of scope.match(/<img\b[^>]*>/gi) || []) pushTag(tag, '');
    if (images.length >= 3) break;
  }

  // Hero fallback when the page exposes nothing else
  if (!images.length) {
    const og = stripped.match(/<meta[^>]+property=["']og:image(?::url)?["'][^>]+content=["']([^"']+)["']/i)
      || stripped.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::url)?["']/i);
    if (og?.[1]) pushTag(`<img src="${og[1].replace(/"/g, '&quot;')}">`, '');
  }

  return images;
}

/** Fetch ONE public image and inline it as a data: URI (picker placement). */
async function fetchWebsiteImageAsDataUri(rawUrl) {
  let finalUrl = assertPublicHttpUrl(rawUrl);
  for (let hop = 0; hop <= WEB_MAX_REDIRECTS; hop += 1) {
    assertPublicHttpUrl(finalUrl.toString());
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), WEB_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(finalUrl.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: ctrl.signal,
        headers: {
          'User-Agent': 'LAIC-SourceBot/1.0 (+course authoring; educational)',
          Accept: 'image/*,*/*;q=0.8',
        },
      });
    } catch (e) {
      clearTimeout(timer);
      if (e?.name === 'AbortError') throw new LlmError(504, 'timeout', 'Timed out fetching that image.');
      throw new LlmError(502, 'fetch_failed', `Could not fetch that image: ${e.message || 'network error'}`);
    } finally {
      clearTimeout(timer);
    }
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get('location');
      if (!loc) throw new LlmError(502, 'bad_redirect', 'The image host redirected without a destination.');
      finalUrl = new URL(loc, finalUrl);
      continue;
    }
    if (!res.ok) throw new LlmError(502, 'http_error', `The image host returned HTTP ${res.status}.`);
    const ctype = String(res.headers.get('content-type') || '').toLowerCase().split(';')[0].trim();
    if (!ctype.startsWith('image/')) throw new LlmError(422, 'not_image', 'That link did not return an image.');
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > IMG_MAX_BYTES) throw new LlmError(413, 'too_large', 'That image is too large to inline (max ~6 MB).');
    return { dataUri: `data:${ctype};base64,${buf.toString('base64')}`, contentType: ctype, bytes: buf.length };
  }
  throw new LlmError(502, 'too_many_redirects', 'Too many redirects while fetching that image.');
}

/* ─── Publish learning objects → shared Nexus Supabase ───────────── */
// The standalone site has no Nexus session, so submitted content is published
// here server-side (service role key; RLS stays closed to the public).

const NEXUS_SUPABASE_URL = process.env.NEXUS_SUPABASE_URL || '';
const NEXUS_SUPABASE_SERVICE_ROLE_KEY = process.env.NEXUS_SUPABASE_SERVICE_ROLE_KEY || '';
const LEARNING_ORG_ID = process.env.LEARNING_ORG_ID || '';

async function publishLearningObjectRow(row, share = false) {
  if (!NEXUS_SUPABASE_URL || !NEXUS_SUPABASE_SERVICE_ROLE_KEY || !LEARNING_ORG_ID) {
    throw new LlmError(503, 'not_configured', 'Shared-library publishing is not configured on the server.');
  }
  const id = String(row?.id || '').trim();
  const type = String(row?.type || '').trim();
  if (!id || !type) throw new LlmError(400, 'bad_object', 'Object id and type are required.');
  const out = {
    id,
    organization_id: LEARNING_ORG_ID,
    program_id: row.program_id ?? null,
    type,
    title: String(row.title || ''),
    owner_id: row.owner_id != null ? String(row.owner_id) : null,
    owner_name: row.owner_name != null ? String(row.owner_name) : null,
    status: String(row.status || 'in-review'),
    scope: String(row.scope || 'bridge'),
    reuse_count: Number(row.reuse_count) || 0,
    description: String(row.description || ''),
    estimated_time: String(row.estimated_time || ''),
    blocks: Array.isArray(row.blocks) ? row.blocks : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    source_ids: Array.isArray(row.source_ids) ? row.source_ids : [],
    collection_ids: Array.isArray(row.collection_ids) ? row.collection_ids : [],
    collection_names: Array.isArray(row.collection_names) ? row.collection_names : [],
    pipeline_draft: row.pipeline_draft ?? null,
    updated_at: new Date().toISOString(),
  };
  // Sharing is opt-in per object (see migration 0002_public_share.sql). Only
  // ever set — never cleared here, so re-publishing cannot silently revoke a
  // link someone already handed out.
  if (share) out.shared_at = new Date().toISOString();
  const res = await fetch(`${NEXUS_SUPABASE_URL}/rest/v1/learning_objects?on_conflict=id`, {
    method: 'POST',
    headers: {
      apikey: NEXUS_SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${NEXUS_SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify([out]),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new LlmError(502, 'supabase_error', `Shared library upsert failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  return { ok: true, id };
}

async function fetchWebsitePage(rawUrl) {
  let url = assertPublicHttpUrl(rawUrl);
  let html = '';
  let finalUrl = url;

  for (let hop = 0; hop <= WEB_MAX_REDIRECTS; hop += 1) {
    assertPublicHttpUrl(finalUrl.toString());
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), WEB_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(finalUrl.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: ctrl.signal,
        headers: {
          'User-Agent': 'LAIC-SourceBot/1.0 (+course authoring; educational)',
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        },
      });
    } catch (e) {
      clearTimeout(timer);
      if (e?.name === 'AbortError') {
        throw new LlmError(504, 'timeout', 'Timed out fetching that page. Try again, or paste the article text instead.');
      }
      throw new LlmError(502, 'fetch_failed', `Could not reach that website: ${e.message || 'network error'}`);
    } finally {
      clearTimeout(timer);
    }

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get('location');
      if (!loc) throw new LlmError(502, 'bad_redirect', 'The site redirected without a destination.');
      finalUrl = new URL(loc, finalUrl);
      continue;
    }

    if (!res.ok) {
      throw new LlmError(502, 'http_error', `The website returned HTTP ${res.status}.`);
    }

    const ctype = String(res.headers.get('content-type') || '').toLowerCase();
    if (ctype && !ctype.includes('text/html') && !ctype.includes('application/xhtml') && !ctype.includes('text/plain')) {
      throw new LlmError(422, 'not_html', 'That link is not a web page we can read as text (need HTML). Try pasting the article instead.');
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > WEB_MAX_BYTES) {
      throw new LlmError(413, 'too_large', 'That page is too large to ingest. Try a shorter article URL, or paste the text.');
    }
    html = buf.toString('utf8');
    break;
  }

  if (!html) throw new LlmError(502, 'empty_page', 'No page content was returned.');

  const title = extractHtmlTitle(html, finalUrl.hostname);
  const articleHtml = sanitizeArticleHtml(html);
  const text = htmlToPlainText(html);
  if (!text || text.replace(/\s+/g, ' ').trim().length < 80) {
    throw new LlmError(422, 'no_text', 'Could not extract enough readable text from that page (it may be paywalled or heavily scripted). Try Paste text instead.');
  }

  // Cap very long pages so Mark up stays usable
  const capped = text.length > 120_000 ? text.slice(0, 120_000) : text;
  const sentences = toSentences(capped);
  if (!sentences.length) {
    throw new LlmError(422, 'no_sentences', 'Extracted text but could not split it into sentences. Try Paste text.');
  }
  let images;
  try {
    const found = extractWebsiteImages(html, finalUrl.toString());
    images = found.length ? found : undefined;
  } catch {
    images = undefined; // image harvesting must never break text ingestion
  }

  return {
    title,
    sentences,
    url: finalUrl.toString(),
    /** Sanitized article HTML for Markup — preserves website structure/formatting. */
    html: articleHtml || undefined,
    /** Content images for the authoring image picker. */
    images,
  };
}

/* ─── Tutorial: expand AI prompt into markable source text ────────── */

async function expandPromptToSource(prompt, opts = {}) {
  const brief = String(prompt || '').trim();
  if (!brief) throw new LlmError(400, 'no_prompt', 'Describe what the object should teach.');
  const system = [
    'You write a clear teaching SOURCE document for a course author to mark up.',
    'Expand the author brief into factual, well-structured educational prose — like a short textbook excerpt or lesson notes.',
    'Use short paragraphs and complete sentences suitable for sentence-level markup.',
    'Cover definitions, key rules, examples, common pitfalls, and practical takeaways grounded in the brief.',
    'Do NOT write a tutorial script, quiz, or UI copy. Do NOT wrap the answer in markdown fences.',
    'Respond ONLY with JSON: {"title":string,"text":string}',
    'text should be 600–1400 words of plain prose with blank lines between paragraphs.',
  ].join('\n');
  const user = [
    opts.title ? `Working title: ${opts.title}` : '',
    opts.objective ? `Learning outcome: ${opts.objective}` : '',
    '',
    'Author brief:',
    brief,
    '',
    'Return the JSON object now.',
  ].filter(Boolean).join('\n');
  const raw = await callAnthropic({ system, user, maxTokens: 4096 });
  const parsed = extractJson(raw);
  const obj = Array.isArray(parsed) ? parsed[0] : parsed;
  const text = String(obj?.text || obj?.content || obj?.source || '').trim();
  if (text.length < 120) throw new LlmError(502, 'llm_parse', 'The model did not return enough source text. Try a fuller brief.');
  const title = String(obj?.title || opts.title || 'AI-generated source').trim() || 'AI-generated source';
  return { title, text };
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

const LEGACY_FLAG_KINDS = new Set(['core', 'confusion', 'diagram', 'out_of_scope']);
const FLAG_KIND_TO_TAG = {
  core: 'Use',
  confusion: 'Note',
  diagram: 'Support',
  out_of_scope: 'Ignore',
};
const ALLOWED_TAGS = new Set(['Use', 'Support', 'Ignore', 'Note']);

function slugifyKind(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

function buildFlagCorpus(items, offset = 0) {
  return items.map((it, j) => {
    const i = offset + j;
    const text = String(it?.text || '').replace(/\s+/g, ' ').trim().slice(0, 220);
    return `[${i}|p${it?.page || 1}] ${text}`;
  }).join('\n');
}

function normalizeMarkupFlags(parsed, items, { requireFocusGroups = false } = {}) {
  const arr = Array.isArray(parsed)
    ? parsed
    : (parsed && Array.isArray(parsed.flags) ? parsed.flags : []);
  const n = items.length;
  const out = [];
  const seen = new Set();
  for (const raw of arr) {
    if (!raw || typeof raw !== 'object') continue;
    let kind = slugifyKind(raw.kind || raw.group || raw.groupId);
    if (kind === 'out-of-scope' || kind === 'outofscope') kind = 'out_of_scope';
    if (!kind) continue;
    if (!requireFocusGroups && !LEGACY_FLAG_KINDS.has(kind) && !String(raw.groupLabel || '').trim()) {
      // Legacy scans only accept fixed kinds unless a group label is present.
      continue;
    }
    const groupLabelRaw = String(raw.groupLabel || raw.group_label || raw.label || '').trim();
    if (requireFocusGroups && LEGACY_FLAG_KINDS.has(kind) && !groupLabelRaw) {
      // Focus scans must invent focus-specific groups, not the generic four.
      continue;
    }
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
    const groupLabel = groupLabelRaw
      || (LEGACY_FLAG_KINDS.has(kind)
        ? ({ core: 'Core concept', confusion: 'Common confusion', diagram: 'Diagram / visual', out_of_scope: 'Out of scope' }[kind])
        : kind.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
    const title = String(raw.title || '').trim()
      || excerpt.slice(0, 72) + (excerpt.length > 72 ? '…' : '');
    let suggestedTag = String(raw.suggestedTag || raw.tag || FLAG_KIND_TO_TAG[kind] || 'Use');
    if (!ALLOWED_TAGS.has(suggestedTag)) suggestedTag = 'Use';
    const sectionId = typeof raw.sectionId === 'string' && raw.sectionId.trim()
      ? raw.sectionId.trim()
      : undefined;
    out.push({
      id: `flag-${Date.now().toString(36)}-${out.length}`,
      kind,
      groupLabel,
      title,
      rationale: String(raw.rationale || raw.why || '').trim() || undefined,
      startIdx,
      endIdx,
      page: items[startIdx]?.page || 1,
      excerpt: excerpt.slice(0, 600),
      suggestedTag,
      status: 'pending',
      sectionId,
    });
  }
  return out;
}

function quotaSelectFlags(flags, { focusMode = false } = {}) {
  if (focusMode) {
    const byKind = new Map();
    for (const f of flags) {
      if (!byKind.has(f.kind)) byKind.set(f.kind, []);
      byKind.get(f.kind).push(f);
    }
    const selected = [];
    const perGroup = Math.max(3, Math.ceil(24 / Math.max(1, byKind.size)));
    for (const list of byKind.values()) {
      selected.push(...list.slice(0, perGroup));
    }
    if (selected.length < 12) {
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
  const counts = new Map();
  for (const f of flags) {
    const label = f.groupLabel || f.kind;
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  if (!counts.size) return 'No review items found — try a clearer scan focus, or mark up manually.';
  const parts = [...counts.entries()].map(([label, n]) => `${n} × ${label}`);
  return `Grouped by your scan focus: ${parts.join(' · ')}.`;
}

async function suggestMarkupFlagsPass(corpus, { instruction, objective, title, scopeNote, focusMode }) {
  const focus = String(instruction || '').trim();
  const system = focusMode
    ? [
      'You help a course author mark up a source for a tutorial.',
      'The author gave a SCAN FOCUS. Invent 3–6 DISTINCT groups specific to that focus — not generic buckets like "core concept", "common confusion", "diagram/visual", or "out of scope".',
      'Group labels must reflect the focus (e.g. focus "opening bids" → groups like "1NT range", "suit-length requirements", "responses to 1♥").',
      'Each item is a short passage span (startIdx–endIdx inclusive) belonging to one of those groups.',
      'Highlight passages that matter for the focus; skip filler.',
      'Respond ONLY with a JSON array of objects:',
      '{"kind":"snake_case_slug","groupLabel":"Human Label","title":string,"rationale":string,"startIdx":number,"endIdx":number,"suggestedTag":"Use"|"Support"|"Ignore"|"Note"}',
      'Aim for 12–28 items total across your focus groups (fewer for a short excerpt). Prefer multi-sentence spans when an idea spans adjacent lines.',
    ].join('\n')
    : [
      'You help a course author mark up a source for a tutorial.',
      'Read the numbered sentences once and return a SMALL set of decision items — not one flag per sentence.',
      'Each item is a short passage span (startIdx–endIdx inclusive) with a kind:',
      '  core — load-bearing concepts / definitions / rules the tutorial must teach',
      '  confusion — places learners commonly mix up or misread',
      '  diagram — text that points to a figure, table, diagram, or visual worth importing',
      '  out_of_scope — material that seems peripheral given the learning outcome',
      'Respond ONLY with a JSON array of objects:',
      '{"kind":"core"|"confusion"|"diagram"|"out_of_scope","groupLabel":string,"title":string,"rationale":string,"startIdx":number,"endIdx":number,"suggestedTag":"Use"|"Support"|"Ignore"|"Note"}',
      'Aim for roughly 15–28 items total across kinds for a full document (fewer for a short excerpt). Prefer multi-sentence spans when a idea spans adjacent lines. Do not flag filler.',
    ].join('\n');
  const user = [
    title ? `Document: ${title}` : '',
    objective ? `Learning outcome: ${objective}` : '',
    focus ? `SCAN FOCUS (required — invent groups from this): ${focus}` : '',
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
 * When instruction (scan focus) is set, groups are invented from that focus.
 * @param {{ text: string, page?: number }[]} items
 */
async function suggestMarkupFlags(items, opts = {}) {
  const list = Array.isArray(items) ? items.filter((it) => it && String(it.text || '').trim()) : [];
  if (!list.length) throw new LlmError(400, 'no_sentences', 'No sentences to analyze.');

  const sections = Array.isArray(opts.sections)
    ? opts.sections.filter((s) => s && String(s.id || '').trim() && String(s.title || '').trim())
    : [];

  // Define-first: propose highlights grouped by human-defined sections.
  if (sections.length) {
    const sectionLines = sections.map((s, i) => (
      `(${i + 1}) id=${s.id} title="${String(s.title).replace(/"/g, "'")}" intent="${String(s.intent || '').replace(/"/g, "'")}"`
    )).join('\n');
    const system = [
      'You help a course author mark up a source for a tutorial.',
      'The author already DEFINED the tutorial sections. Propose source passages that SUPPORT each defined section.',
      'Do NOT invent new sections or decide the outline — only find evidence for the given sections.',
      'Each item must include sectionId matching one of the provided section ids.',
      'Respond ONLY with a JSON array of objects:',
      '{"sectionId":string,"kind":"snake_case_slug","groupLabel":string,"title":string,"rationale":string,"startIdx":number,"endIdx":number,"suggestedTag":"Use"|"Support"|"Ignore"|"Note"}',
      'groupLabel MUST be the section title. Aim for 2–6 items per section when evidence exists; skip a section if nothing supports it.',
      'Prefer multi-sentence spans when an idea spans adjacent lines. Do not flag filler.',
    ].join('\n');

    let collected = [];
    const n = list.length;
    const runPass = async (slice, offset, scopeNote) => {
      const user = [
        opts.title ? `Document: ${opts.title}` : '',
        opts.objective ? `Learning objective: ${opts.objective}` : '',
        'DEFINED SECTIONS (propose passages for these only):',
        sectionLines,
        scopeNote || '',
        '',
        'Sentences (format [index|page] text):',
        buildFlagCorpus(slice, offset),
        '',
        'Return the JSON array now. Every item needs a valid sectionId from the list above.',
      ].filter(Boolean).join('\n');
      const raw = await callAnthropic({ system, user, maxTokens: 4096 });
      return extractJson(raw);
    };

    if (n <= 160) {
      const parsed = await runPass(list, 0, 'This is the full document excerpt available for markup.');
      collected = normalizeMarkupFlags(parsed, list, { requireFocusGroups: true });
      // Stamp sectionId from model or match groupLabel → section
      collected = collected.map((f) => stampSectionIdOnFlag(f, sections, parsed));
    } else {
      const batches = [];
      let start = 0;
      while (start < n) {
        const startPage = list[start].page || 1;
        let end = start + 1;
        while (end < n && (end - start) < 55 && (list[end].page || 1) <= startPage + 4) end += 1;
        if (end === start) end = Math.min(n, start + 45);
        batches.push([start, end]);
        start = end;
      }
      const maxBatches = 6;
      const step = batches.length > maxBatches ? Math.ceil(batches.length / maxBatches) : 1;
      for (let i = 0; i < batches.length; i += step) {
        const [a, b] = batches[i];
        const slice = list.slice(a, b);
        const parsed = await runPass(slice, a, `Chunk sentences ${a}–${b - 1} of ${n}. Only flag items in this chunk.`);
        const norm = normalizeMarkupFlags(parsed, list, { requireFocusGroups: true }).map((f) => stampSectionIdOnFlag(f, sections, parsed));
        collected.push(...norm);
      }
    }

    // Ensure every flag has a sectionId; drop those that cannot be mapped.
    collected = collected.map((f) => {
      if (f.sectionId && sections.some((s) => s.id === f.sectionId)) return f;
      const byTitle = sections.find((s) => s.title.toLowerCase() === String(f.groupLabel || '').toLowerCase());
      if (byTitle) return { ...f, sectionId: byTitle.id, groupLabel: byTitle.title };
      return null;
    }).filter(Boolean);

    const flags = quotaSelectFlags(collected, { focusMode: true });
    const stamped = flags.map((f, i) => ({ ...f, id: `flag-${Date.now().toString(36)}-${i}` }));
    const summary = summarizeSectionFlags(stamped, sections);
    return { flags: stamped, summary };
  }

  const focus = String(opts.instruction || '').trim();
  if (!focus) {
    throw new LlmError(400, 'no_scan_focus', 'Enter a scan focus so the document can be grouped for review.');
  }
  const focusMode = true;
  const n = list.length;
  let collected = [];

  if (n <= 160) {
    const parsed = await suggestMarkupFlagsPass(buildFlagCorpus(list), {
      instruction: focus,
      objective: opts.objective,
      title: opts.title,
      scopeNote: 'This is the full document excerpt available for markup.',
      focusMode,
    });
    collected = normalizeMarkupFlags(parsed, list, { requireFocusGroups: true });
  } else {
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
    const maxBatches = 6;
    const step = batches.length > maxBatches ? Math.ceil(batches.length / maxBatches) : 1;
    const chosen = [];
    for (let i = 0; i < batches.length; i += step) chosen.push(batches[i]);

    for (const [a, b] of chosen) {
      const slice = list.slice(a, b);
      const parsed = await suggestMarkupFlagsPass(buildFlagCorpus(slice, a), {
        instruction: focus,
        objective: opts.objective,
        title: opts.title,
        scopeNote: `This is a chunk of the document (sentences ${a}–${b - 1} of ${n}). Flag only items in this chunk. Reuse the same focus-derived group kinds across chunks.`,
        focusMode,
      });
      collected.push(...normalizeMarkupFlags(parsed, list, { requireFocusGroups: true }));
    }
  }

  const flags = quotaSelectFlags(collected, { focusMode: true });
  const stamped = flags.map((f, i) => ({ ...f, id: `flag-${Date.now().toString(36)}-${i}` }));
  return { flags: stamped, summary: summarizeFlags(stamped) };
}

function stampSectionIdOnFlag(flag, sections, parsedRaw) {
  if (flag.sectionId && sections.some((s) => s.id === flag.sectionId)) {
    const s = sections.find((x) => x.id === flag.sectionId);
    return { ...flag, groupLabel: s.title };
  }
  // Try match from raw parsed items by title/excerpt
  if (Array.isArray(parsedRaw)) {
    const hit = parsedRaw.find((p) => p && String(p.title || '') === String(flag.title || '') && p.sectionId);
    if (hit && sections.some((s) => s.id === hit.sectionId)) {
      const s = sections.find((x) => x.id === hit.sectionId);
      return { ...flag, sectionId: hit.sectionId, groupLabel: s.title };
    }
  }
  const byLabel = sections.find((s) => s.title.toLowerCase() === String(flag.groupLabel || '').toLowerCase());
  if (byLabel) return { ...flag, sectionId: byLabel.id, groupLabel: byLabel.title };
  return flag;
}

function summarizeSectionFlags(flags, sections) {
  if (!flags.length) return 'No passages found for your defined sections — try marking manually, or refine section intents.';
  const counts = new Map(sections.map((s) => [s.id, 0]));
  for (const f of flags) {
    if (f.sectionId && counts.has(f.sectionId)) counts.set(f.sectionId, counts.get(f.sectionId) + 1);
  }
  const parts = sections.map((s) => `${counts.get(s.id) || 0} × ${s.title}`);
  return `Proposed against your Plan sections: ${parts.join(' · ')}.`;
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
      // Keep every distinct author note when passages merge.
      const notes = [hit.authorNote, p.authorNote].map((n) => String(n || '').trim()).filter(Boolean);
      if (notes.length) hit.authorNote = [...new Set(notes)].join(' | ');
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

const UNASSIGNED_SECTION_ID = '__unassigned__';

/** Define-first extract: fixed clusters = defined sections + Unassigned (no emergent names). */
function buildClusteredKnowledgeBaseFromDefinition({ highlights, extracts, tutorialDefinition }) {
  const sections = Array.isArray(tutorialDefinition?.sections)
    ? tutorialDefinition.sections.filter((s) => s && String(s.id || '').trim() && String(s.title || '').trim())
    : [];
  const raw = [];
  if (Array.isArray(highlights) && highlights.length) {
    for (const h of highlights) {
      if (h.tag !== 'Use' && h.tag !== 'Support' && h.tag !== 'Note') continue;
      if (h.tag === 'Note' && !String(h.comment || '').trim()) continue;
      const { text, authorNote } = splitPassageAndNote(h.text, h.comment);
      if (!text) continue;
      raw.push({
        text,
        authorNote,
        from: (() => {
          const label = h.sourceLabel || h.from || null;
          const pageBit = h.page != null ? `p.${h.page}` : null;
          if (label && pageBit) return `${label} · ${pageBit}`;
          if (label) return String(label);
          if (pageBit) return pageBit;
          return undefined;
        })(),
        fromHl: true,
        kind: h.tag === 'Support' ? 'Fact' : h.tag === 'Note' ? 'Key point' : undefined,
        sourceHighlightIds: [h.idx].filter((n) => n != null),
        sourceLabel: h.sourceLabel || undefined,
        sectionId: h.sectionId || undefined,
      });
    }
  } else if (Array.isArray(extracts)) {
    for (const e of extracts) {
      const { text, authorNote } = splitPassageAndNote(e.text, e.authorNote || e.comment);
      raw.push({
        text,
        authorNote,
        from: e.from,
        fromHl: !!e.fromHl,
        kind: e.kind,
        sourceHighlightIds: e.sourceHighlightIds,
        sectionId: e.sectionId || undefined,
      });
    }
  }

  const rawHighlightCount = raw.length;
  const merged = dedupePassages(raw);
  const sectionIds = new Set(sections.map((s) => s.id));
  const units = merged.map((p, i) => {
    const sid = p.sectionId && sectionIds.has(p.sectionId) ? p.sectionId : UNASSIGNED_SECTION_ID;
    return {
      id: p.id || `u${i + 1}`,
      kind: UNIT_KINDS.includes(p.kind) ? p.kind : classifyUnitKind(p.text),
      text: p.text,
      authorNote: p.authorNote || undefined,
      from: p.from,
      fromHl: !!p.fromHl,
      sourceHighlightIds: p.sourceHighlightIds || [],
      sourceLabel: p.sourceLabel || undefined,
      sectionId: sid,
      clusterId: sid,
    };
  });

  const clusters = sections.map((s) => ({
    id: s.id,
    name: String(s.title).trim(),
    unitIds: units.filter((u) => u.sectionId === s.id).map((u) => u.id),
    sectionId: s.id,
  }));
  clusters.push({
    id: UNASSIGNED_SECTION_ID,
    name: 'Unassigned',
    unitIds: units.filter((u) => u.sectionId === UNASSIGNED_SECTION_ID).map((u) => u.id),
    sectionId: UNASSIGNED_SECTION_ID,
  });

  return {
    units,
    clusters,
    rawHighlightCount,
    mergedUnitCount: units.length,
    gaps: [],
  };
}

function splitPassageAndNote(text, comment) {
  const note = String(comment || '').trim();
  let passage = String(text || '').trim();
  // Legacy pulls baked "passage — note" into text; undo when comment is absent.
  if (!note && /\s—\s/.test(passage)) {
    const parts = passage.split(/\s—\s/);
    if (parts.length >= 2) {
      const maybeNote = parts[parts.length - 1].trim();
      const maybePassage = parts.slice(0, -1).join(' — ').trim();
      if (maybePassage && maybeNote && maybeNote.length < 400) {
        return { text: maybePassage, authorNote: maybeNote };
      }
    }
  }
  return { text: passage, authorNote: note || undefined };
}

function buildClusteredKnowledgeBase({ highlights, extracts, shapeIntent, objective, topic }) {
  const raw = [];
  if (Array.isArray(highlights) && highlights.length) {
    for (const h of highlights) {
      // Use/Support are teaching backbone; Note with a comment is an author directive on a passage.
      if (h.tag !== 'Use' && h.tag !== 'Support' && h.tag !== 'Note') continue;
      if (h.tag === 'Note' && !String(h.comment || '').trim()) continue;
      const { text, authorNote } = splitPassageAndNote(h.text, h.comment);
      if (!text) continue;
      raw.push({
        text,
        authorNote,
        from: (() => {
          const label = h.sourceLabel || h.from || null;
          const pageBit = h.page != null ? `p.${h.page}` : null;
          if (label && pageBit) return `${label} · ${pageBit}`;
          if (label) return String(label);
          if (pageBit) return pageBit;
          return undefined;
        })(),
        fromHl: true,
        kind: h.tag === 'Support' ? 'Fact' : h.tag === 'Note' ? 'Key point' : undefined,
        sourceHighlightIds: [h.idx].filter((n) => n != null),
        sourceLabel: h.sourceLabel || undefined,
      });
    }
  } else if (Array.isArray(extracts)) {
    for (const e of extracts) {
      const { text, authorNote } = splitPassageAndNote(e.text, e.authorNote || e.comment);
      raw.push({
        text,
        authorNote,
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
    authorNote: p.authorNote || undefined,
    from: p.from,
    fromHl: !!p.fromHl,
    sourceHighlightIds: p.sourceHighlightIds || [],
    sourceLabel: p.sourceLabel || undefined,
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
  if (clusters.length > 20) {
    clusters = clusters
      .sort((a, b) => b.unitIds.length - a.unitIds.length)
      .slice(0, 20);
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
  const sample = kb.units.slice(0, 80).map((u, i) => (
    `(${i}) [${u.kind}]${u.from ? ` (${u.from})` : ''} ${u.text.slice(0, 200)}`
  )).join('\n');
  const sourceNames = [...new Set(kb.units.map((u) => {
    const from = String(u.from || '');
    const cut = from.indexOf(' · ');
    return cut >= 0 ? from.slice(0, cut) : (u.sourceLabel || '');
  }).filter(Boolean))];
  const system = [
    'You organize tutorial source units into concept clusters.',
    'Return ONLY JSON: {"clusters":[{"name":string,"unitIndices":number[]}]}',
    'Every unit index 0..n-1 must appear in exactly one cluster.',
    'Prefer 3–12 clusters with clear topic names.',
    'CRITICAL: When units come from multiple sources, keep material from EVERY source — do not drop a source because the title/topic names only one subject.',
    'If sources are unrelated topics, make separate clusters per source/topic rather than forcing one theme.',
  ].join(' ');
  const user = [
    `Objective: ${objective || '(none)'}`,
    `Topic: ${topic || '(none)'}`,
    shapeIntent ? `Shape intent: ${shapeIntent}` : '',
    sourceNames.length ? `Sources present (must all be represented): ${sourceNames.join(' · ')}` : '',
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
  const { title, config, extracts, prompt, media, template, knowledgeBase, sectionPlans, tutorialDefinition } = body || {};
  const authorDirectives = collectAuthorDirectives(body);
  const directiveBlock = formatAuthorDirectivesBlock(authorDirectives);
  // Define-first / boss rule: AI extras are unreachable for tutorials (belt + suspenders).
  const c = { ...(config || {}), aiExtra: false };
  const num = (v, d) => (typeof v === 'number' ? v : d);
  const secs = num(c.secs, 3);
  const chks = num(c.chks, 1);
  const excpts = num(c.excpts, 1);
  const wex = c.wex !== false;
  const end = c.end || 'Recap only';
  const authorPrompt = prompt || (config && config.prompt) || '';
  const mediaList = Array.isArray(media) ? media.filter((m) => m && m.ref) : [];
  // Word-count targets retired: length is a consequence of curated units + depth.
  c.words = 0;
  const depth = c.dpth || 'Standard';
  const lengthRule = [
    'LENGTH: There is NO word-count target. Do not pad to hit a number and do not truncate real source material to stay short.',
    `Size each section from its assigned source units at depth "${depth}":`,
    /overview/i.test(depth)
      ? 'Overview — concise: cover the units tightly in short paragraphs; no filler.'
      : /in-?depth/i.test(depth)
        ? 'In-depth — thorough stepwise teaching of the units (multiple paragraphs when the units warrant it); still no invented filler.'
        : 'Standard — full short paragraphs that teach each unit clearly.',
    'Empty sections → short rich-text noting missing markup only.',
  ].join(' ');

  // Template + cluster path (preferred)
  if (template && Array.isArray(sectionPlans) && sectionPlans.length && knowledgeBase?.units?.length) {
    const unitsById = new Map((knowledgeBase.units || []).map((u) => [u.id, u]));
    const anyComposite = sectionPlans.some((sp) => Array.isArray(sp.sectionRecipe) && sp.sectionRecipe.length > 0);

    const formatFlatRecipe = (rows) =>
      (rows || [])
        .map((r, i) => `${i + 1}. ${r.type}${r.preferKinds ? ` (prefer: ${r.preferKinds.join(', ')})` : ''}`)
        .join('; ');

    const formatCondition = (cond) => {
      if (!cond || cond.kind === 'always') return '';
      if (cond.kind === 'if_source_kinds') {
        return ` condition=if_source_kinds:[${(cond.kinds || []).join('|')}]`;
      }
      if (cond.kind === 'if_source_hint') {
        return ` condition=if_source_hint:"${String(cond.hint || '').replace(/"/g, "'")}"`;
      }
      return '';
    };

    const formatGenerateMeta = (meta) => {
      if (!meta || typeof meta !== 'object') return '';
      const bits = [
        meta.title ? `title="${String(meta.title).replace(/"/g, "'")}"` : '',
        meta.objective ? `objective="${String(meta.objective).replace(/"/g, "'")}"` : '',
            meta.questionCount != null ? `questionCount=${meta.questionCount}` : '',
            meta.passOn === false ? 'passOn=false' : '',
            meta.passOn !== false && meta.passMark ? `passMark=${meta.passMark}` : '',
        Array.isArray(meta.qtypes) && meta.qtypes.length ? `qtypes=[${meta.qtypes.join('|')}]` : '',
        Array.isArray(meta.cog) && meta.cog.length ? `cog=[${meta.cog.join('|')}]` : '',
        meta.diff ? `diff=${meta.diff}` : '',
        meta.wrong ? `wrong="${String(meta.wrong).replace(/"/g, "'")}"` : '',
        meta.adaptive ? `adaptive=${meta.adaptive}` : '',
        meta.show ? `show=${meta.show}` : '',
        meta.perq != null ? `perq=${meta.perq}` : '',
        meta.cardCount != null ? `cardCount=${meta.cardCount}` : '',
        Array.isArray(meta.cc) && meta.cc.length ? `cc=[${meta.cc.join('|')}]` : '',
        Array.isArray(meta.pull) && meta.pull.length ? `pull=[${meta.pull.join('|')}]` : '',
        meta.dir ? `dir=${meta.dir}` : '',
        meta.hooks != null ? `hooks=${meta.hooks}` : '',
        meta.conceptFocus ? `conceptFocus="${String(meta.conceptFocus).replace(/"/g, "'")}"` : '',
        meta.voi ? `voi="${String(meta.voi).replace(/"/g, "'")}"` : '',
        meta.len ? `len=${meta.len}` : '',
        meta.tt ? `tt=${meta.tt}` : '',
        meta.del ? `del=${meta.del}` : '',
        meta.el ? `el=${meta.el}` : '',
        meta.cite != null ? `cite=${meta.cite}` : '',
        meta.instructions ? `instructions="${String(meta.instructions).replace(/"/g, "'")}"` : '',
      ].filter(Boolean);
      return bits.length ? ` generateMeta={${bits.join(' ')}}` : '';
    };

    const formatCompositeRecipe = (items, sectionId) =>
      (items || []).map((item, i) => {
        const cond = formatCondition(item.condition);
        if (item.kind === 'atomic') {
          const prefer = item.preferKinds?.length ? ` (prefer: ${item.preferKinds.join(', ')})` : '';
          const req = item.required === false ? ' [optional]' : '';
          const note = item.authoringNote
            ? ` authoringNote="${String(item.authoringNote).replace(/"/g, "'")}"`
            : '';
          return `${i + 1}. atomic:${item.blockType}${prefer}${req}${note}${cond}`;
        }
        const req = item.required ? ' required=true' : ' required=false';
        const note = item.authoringNote
          ? ` authoringNote="${String(item.authoringNote).replace(/"/g, "'")}"`
          : '';
        const metaSuffix = formatGenerateMeta(item.generateMeta);
        if (item.sourceMode === 'pick_from_library') {
          const pin = item.libraryTitle || item.versionPin?.objectId
            ? ` libraryObject="${String(item.libraryTitle || item.versionPin.objectId).replace(/"/g, "'")}"`
            : '';
          return (
            `${i + 1}. EMBEDDED_${String(item.objectType || 'object').toUpperCase()} sourceMode=pick_from_library${req}${pin}${note}${cond}`
            + ' → do NOT emit a part; the platform inserts the pinned library object'
          );
        }
        if (item.objectType === 'quiz') {
          return (
            `${i + 1}. EMBEDDED_QUIZ objectType=quiz sourceMode=${item.sourceMode || 'generate'}${req}${note}${metaSuffix}${cond}`
            + ' → emit ONE {"type":"section-quiz",...} for THIS section only (honor generateMeta: qtypes, cog, diff, wrong, etc.)'
          );
        }
        // Non-quiz generate: reserve a slot the client fills via the object-type generator.
        const slotKey = `${sectionId || 'sec'}:${item.id || i}`;
        const otype = String(item.objectType || 'object');
        return (
          `${i + 1}. EMBEDDED_${otype.toUpperCase()} sourceMode=${item.sourceMode || 'generate'}${req}${note}${metaSuffix}${cond}`
          + ` → emit ONE rich-text with heading exactly "⟦EMBED_SLOT:${slotKey}⟧" and body "${otype} (generated separately)"; do NOT invent a full nested object`
        );
      }).join('; ');

    const clusterLines = sectionPlans.map((sp) => {
      const cluster = (knowledgeBase.clusters || []).find((x) => x.id === sp.clusterId);
      const units = (cluster?.unitIds || [])
        .map((id) => unitsById.get(id))
        .filter(Boolean)
        .map((u, i) => `    ${formatUnitLine(u, i)}`)
        .join('\n');
      const useComposite = Array.isArray(sp.sectionRecipe) && sp.sectionRecipe.length > 0;
      const sectionIdForSlots = sp.clusterId || `sec-${sp.index}`;
      const recipe = useComposite
        ? formatCompositeRecipe(sp.sectionRecipe, sectionIdForSlots)
        : formatFlatRecipe(sp.recipe || template.sectionBlockRecipe || []);
      const sectionDepth = sp.depth || c.dpth || 'Standard';
      return [
        `### Section ${sp.index + 1}: ${sp.title}`,
        sp.intent ? `Section intent (human-defined — honor this): ${sp.intent}` : '',
        sp.archetypeId ? `Section type (archetype): ${sp.archetypeId}` : '',
        `Section depth: ${sectionDepth} — size this section from its units at this depth`,
        sp.subheads?.length ? `Subheads: ${sp.subheads.join(' · ')}` : '',
        `Recipe: ${recipe}`,
        'SOURCE UNITS FOR THIS SECTION ONLY (do not use other sections\' units):',
        units || '    (empty — emit a short rich-text noting missing markup for this section; do NOT invent facts)',
      ].filter(Boolean).join('\n');
    }).join('\n\n');

    // aiExtra is force-false above — "AI EXTRAS ALLOWED" prompt branch is unreachable for tutorials.
    const groundingStrict = [
      'CRITICAL: Each section must be built ONLY from that section\'s listed source units. Do not use general encyclopedia knowledge.',
      'If a section\'s units are thin, write a short grounded note — do not invent facts outside those units and do not pad with filler.',
    ].join(' ');

    const compositeQuizRules = anyComposite ? [
      'EMBEDDED QUIZ (composite templates): When a recipe line is EMBEDDED_QUIZ with sourceMode=generate (or prompt_on_author), emit exactly ONE part of type "section-quiz" after that section\'s teaching — a nested quiz *object* for the section, NOT a loose "question" part.',
      'If sourceMode=pick_from_library: do NOT emit a section-quiz or any part for that slot — the platform inserts the pinned library object.',
      'section-quiz shape: {"type":"section-quiz","label":string,"sourceMode":"generate","authoringNote":string,"required":true,"questions":[{"question":string,"options":[four strings],"correct":0-3,"exp":string,"hints":[four strings],"sources":[{"quote":string,"cite":string}]}]}',
      'Honor sourceMode, authoringNote, generateMeta, and required from the recipe line. Ground every question in THAT section\'s units only.',
      'When generateMeta.questionCount is set, emit that many questions; otherwise about ' + Math.max(chks, 1) + ' from the checks-per-section knob.',
      'Do NOT emit separate top-level "question" parts for an EMBEDDED_QUIZ slot. Atomic try-it (if any) may still use a single "question" part.',
      'Other embedded object types with sourceMode=generate: emit ONLY the reserved rich-text slot with heading ⟦EMBED_SLOT:…⟧ as specified in the recipe line — the platform generates the nested object separately. Do not invent a full nested object.',
    ].join('\n') : '';

    const legacyCheckRules = !anyComposite ? [
      'knowledge-check / try-it → question parts. worked-example / explanation / instruction / principle / misconception / correction / scenario-advance / source-excerpt → rich-text with an appropriate label.',
      'Number question labels sequentially across the whole tutorial: "Question 1", "Question 2", …',
      'CHECK PLACEMENT (critical): When assessment is after_each_section or checkpoints, finish ALL teaching parts for a section, then emit that section\'s question(s) IMMEDIATELY before starting the next section heading. Never dump all questions at the end. Never put Section 2\'s teaching before Section 1\'s check. Each question must test ONLY the section it follows.',
    ].join('\n') : [
      'Atomic teaching items → rich-text with an appropriate label. Atomic try-it → a single "question" part.',
      'CHECK PLACEMENT: finish ALL teaching for a section, then the section-quiz (or try-it question), IMMEDIATELY before the next section heading.',
    ].join('\n');

    const sourceNames = [...new Set((knowledgeBase.units || []).map((u) => {
      const from = String(u.from || '');
      const cut = from.indexOf(' · ');
      return cut >= 0 ? from.slice(0, cut) : (u.sourceLabel || '');
    }).filter(Boolean))];

    const system = [
      'You generate a tutorial as STRUCTURED JSON from a FIXED pedagogical template and HUMAN-DEFINED sections with clustered source units.',
      'HARD CONSTRAINTS: Do NOT invent sections, do NOT reorder or add sections, do NOT introduce facts not present in that section\'s assigned units, do NOT decide scope — the human already did.',
      'AI EXTRAS ARE OFF: never add bridging/background beyond the listed source units.',
      groundingStrict,
      sourceNames.length > 1
        ? `MULTI-SOURCE: This tutorial draws on ${sourceNames.length} sources (${sourceNames.join('; ')}). You MUST include teaching from EVERY listed source that appears in the section plans — do not ignore a source because the title or objective names only one topic. If topics differ, teach them as distinct sections (or clearly labeled parts) rather than discarding one.`
        : '',
      'Output ONLY a JSON array of part objects. No markdown fences.',
      lengthRule,
      'Part shapes:',
      '  {"type":"rich-text","label":string,"heading":string|null,"subheads":string[]|null,"body":string}',
      '  {"type":"question","label":string,"prompt":string,"options":[four strings],"correct":0-3,"exp":string,"hints":[four strings],"sources":[{"quote":string,"cite":string}]}',
      '  {"type":"section-quiz","label":string,"sourceMode":"generate","authoringNote":string,"required":boolean,"questions":[{"question":string,"options":[four strings],"correct":0-3,"exp":string,"hints":[four strings],"sources":[{"quote":string,"cite":string}]}]}',
      '  {"type":"media","ref":string}',
      'For each section: emit a rich-text with heading set to the section title (and subheads if given), then follow the recipe order.',
      legacyCheckRules,
      compositeQuizRules,
      'HINTS: Follow the author\'s hint settings below. If hints are ON, every question (inline or inside section-quiz) must include exactly that many progressive strings in "hints". Hint 1 lightly points; later hints get more specific; at least one must tell the learner which section/passage to re-read (use that section\'s title). Never reveal the correct option letter/text. If hints are OFF, set "hints" to [].',
      'SOURCES: Every question should include 1–3 "sources" entries — short verbatim quotes from the content units that justify the correct answer, each with cite like "Bridge.pdf · p.4" or the unit\'s from label. Prefer units from THIS section.',
      'Do not invent media parts unless an available media ref is listed below and pedagogically needed.',
      authorDirectives.length ? authorDirectiveRules() : '',
    ].filter(Boolean).join('\n');

    const assess = template.assessmentPlacement || 'after_each_section';
    const hintOpts = resolveHintSettings(c);
    const user = [
      `Tutorial title: ${title || '(untitled)'}`,
      sourceNames.length > 1
        ? `Note: the title may reflect one source filename; still cover ALL sources in the section plans: ${sourceNames.join(' · ')}`
        : '',
      `Template: ${template.name || template.id} (${template.id})`,
      `Section connection: ${template.sectionConnection || 'sequential'}`,
      `Assessment placement: ${assess}`,
      `Learning objective: ${c.obj || '(none)'}`,
      `Overall topic: ${c.topic || title || '(none)'}`,
      `Audience: ${c.aud || 'High school'} · Level: ${c.lvl || 'Basic'} · Depth: ${c.dpth || 'Standard'}`,
      `Length: no word target — size from assigned units + depth "${depth}"`,
      `Checks per section knob: ${chks} (honor template assessment placement; if after_each_section / checkpoints, emit ~${Math.max(chks, 1)} check(s) per section from THAT section's units)`,
      `Pass mark (all checks combined): ${c.pass || '70%'}`,
      `Progressive hints: ${hintOpts.enabled ? `ON — exactly ${hintOpts.count} per question` : 'OFF — set hints to []'}`,
      `AI extras beyond source: OFF — stay strictly within marked-up units`,
      `End with: ${end}`,
      authorPrompt ? `Author note:\n${authorPrompt}` : '',
      directiveBlock,
      '',
      'SECTION PLANS (one cluster each):',
      clusterLines,
      '',
      mediaList.length ? `Available media refs: ${mediaList.map((m) => `${m.ref}(${m.kind})`).join(', ')}` : 'No media attached.',
      '',
      'Produce IN ORDER: (1) Introduction rich-text with heading "Introduction", (2) for EACH section: teaching parts then that section\'s check(s), (3) closing per End with.',
      assess === 'end_only'
        ? (anyComposite
          ? 'Put section-quiz / knowledge-check questions ONLY after all sections (end quiz), not mid-section.'
          : 'Put knowledge-check questions ONLY after all sections (end quiz), not mid-section.')
        : '',
      assess === 'none' ? 'Do not emit knowledge-check or section-quiz parts.' : '',
      (assess === 'after_each_section' || assess === 'checkpoints_after_each')
        ? (anyComposite
          ? `Pattern per section: [heading rich-text] → [teaching…] → [ONE section-quiz with ~${Math.max(chks, 1)} question(s)] → next section.`
          : `Pattern per section: [heading rich-text] → [teaching…] → [${Math.max(chks, 1)} question(s)] → next section.`)
        : '',
      'Return the JSON array now.',
    ].filter(Boolean).join('\n');

    return { system, user, secs: sectionPlans.length };
  }

  // Legacy flat-extract fallback
  const hasExtracts = Array.isArray(extracts) && extracts.length > 0;
  const extractLines = hasExtracts
    ? extractLinesFrom(extracts)
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
    authorDirectives.length ? authorDirectiveRules() : '',
    'Output ONLY a JSON array of "part" objects. No prose, no markdown fences.',
    lengthRule,
    'Allowed part shapes:',
    '  {"type":"rich-text","label":string,"heading":string|null,"subheads":string[]|null,"body":string}',
    '  {"type":"question","label":string,"prompt":string,"options":[four strings],"correct":integer 0-3,"exp":string,"hints":[four strings],"sources":[{"quote":string,"cite":string}]}',
    mediaList.length ? '  {"type":"media","ref":string}' : '',
    'Number questions sequentially: Question 1, Question 2, …',
    'Follow author hint settings in the user message for how many progressive hints to include (or none).',
    'Each question should include 1–3 "sources" with short quotes from the units and a cite (unit from label).',
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
    `Length: no word target — size from assigned units + depth "${depth}"`,
    `Pass mark (all checks combined): ${c.pass || '70%'}`,
    `Progressive hints: ${hintOptsLegacy.enabled ? `ON — exactly ${hintOptsLegacy.count} per question` : 'OFF — set hints to []'}`,
    `AI extras beyond source: ${allowExtraLegacy ? 'ON' : 'OFF'}`,
    authorPrompt ? `\nAuthor's prompt / description:\n${authorPrompt}` : '',
    directiveBlock,
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

/** Rough output token budget from a teaching-word target (JSON overhead included). */
function tokensForWordBudget(words, floor = 4096) {
  const w = Math.max(0, Number(words) || 0);
  const estimate = Math.ceil(w * 2.2) + 3500;
  return Math.min(32768, Math.max(floor, estimate));
}

function countTeachingWordsInParts(parts) {
  let n = 0;
  for (const p of parts || []) {
    if (!p || typeof p !== 'object') continue;
    if (p.type === 'rich-text') {
      n += String(p.body || '').trim().split(/\s+/).filter(Boolean).length;
    } else if (p.type === 'concept-card') {
      n += String(p.plain || '').trim().split(/\s+/).filter(Boolean).length;
      n += String(p.misc || '').trim().split(/\s+/).filter(Boolean).length;
    }
  }
  return n;
}

/**
 * For large explicit word targets, generate intro / each section / closing in separate LLM calls
 * so a single max_tokens ceiling cannot silently truncate a 5–10k word draft.
 */
function buildTutorialChunkJobs(body) {
  // Retired: word-target chunking caused pad/truncate behavior.
  // Length now follows curated units + depth in a single generate pass.
  return null;
  /* unreachable word-target chunk path
  const { title, config, template, knowledgeBase, sectionPlans, prompt, media } = body || {};
  const c = config || {};
  const wordTarget = resolveTutorialWordTarget(c);
  const explicitWords = Number(c.words) > 0;
  const plans = Array.isArray(sectionPlans) ? sectionPlans : [];
  if (!explicitWords || wordTarget < 1800 || !template || !plans.length || !knowledgeBase?.units?.length) {
    return null;
  }

  const n = plans.length;
  const introWords = Math.min(600, Math.max(180, Math.round(wordTarget * 0.07)));
  const closeWords = Math.min(500, Math.max(120, Math.round(wordTarget * 0.05)));
  const sectionPool = Math.max(n * 200, wordTarget - introWords - closeWords);
  const perSection = Math.round(sectionPool / n);
  const chks = typeof c.chks === 'number' ? c.chks : 1;
  const end = c.end || 'Recap only';
  const allowExtra = c.aiExtra === true;
  const hintOpts = resolveHintSettings(c);
  const authorPrompt = prompt || c.prompt || '';
  const mediaList = Array.isArray(media) ? media.filter((m) => m && m.ref) : [];
  const unitsById = new Map((knowledgeBase.units || []).map((u) => [u.id, u]));
  const anyComposite = plans.some((sp) => Array.isArray(sp.sectionRecipe) && sp.sectionRecipe.length > 0);

  const formatCompositeRecipe = (items) =>
    (items || []).map((item, i) => {
      const note = item.authoringNote
        ? ` authoringNote="${String(item.authoringNote).replace(/"/g, "'")}"`
        : '';
      if (item.kind === 'atomic') {
        const prefer = item.preferKinds?.length ? ` (prefer: ${item.preferKinds.join(', ')})` : '';
        const req = item.required === false ? ' [optional]' : '';
        return `${i + 1}. atomic:${item.blockType}${prefer}${req}${note}`;
      }
      if (item.objectType === 'quiz') {
        return `${i + 1}. EMBEDDED_QUIZ${note} → emit ONE section-quiz for THIS section only (honor generateMeta)`;
      }
      return `${i + 1}. EMBEDDED_${String(item.objectType || 'object').toUpperCase()}${note} [skip if deferred]`;
    }).join('; ');

  const formatFlatRecipe = (rows) =>
    (rows || []).map((r, i) => `${i + 1}. ${r.type}`).join('; ');

  const sharedSystem = [
    'You generate ONE chunk of a tutorial as STRUCTURED JSON (a JSON array of part objects only).',
    allowExtra
      ? 'PRIMARY SOURCE: section units are the backbone. AI EXTRAS ALLOWED to reach the HARD word minimum with examples and stepwise teaching — do not contradict the units.'
      : 'CRITICAL: Use ONLY the listed source units. Expand with stepwise restatements and examples drawn from those units to hit the word minimum — do not invent contradicting facts.',
    'Output ONLY a JSON array. No markdown fences.',
    'Part shapes: rich-text {type,label,heading,subheads,body}; question {type,label,prompt,options,correct,exp,hints,sources}; section-quiz {type,label,sourceMode,authoringNote,required,questions:[{question,options,correct,exp,hints,sources}]}.',
    `HINTS: ${hintOpts.enabled ? `ON — exactly ${hintOpts.count} progressive hints per question` : 'OFF — hints: []'}.`,
    'SOURCES: 1–3 short quotes per question with cite from unit from-labels when possible.',
  ].join('\n');

  const jobs = [];

  jobs.push({
    label: 'Writing introduction…',
    maxTokens: tokensForWordBudget(introWords, 3072),
    system: sharedSystem,
    user: [
      `Tutorial title: ${title || '(untitled)'}`,
      `Learning objective: ${c.obj || '(none)'}`,
      `Audience: ${c.aud || 'High school'} · Level: ${c.lvl || 'Basic'}`,
      authorPrompt ? `Author note:\n${authorPrompt}` : '',
      '',
      `CHUNK: Introduction only.`,
      `HARD MINIMUM: at least ${Math.round(introWords * 0.85)} words in rich-text body text.`,
      'Emit exactly one rich-text part with heading "Introduction" (and optional extra rich-text parts if needed to hit the word budget).',
      'Do NOT emit section quizzes or other sections.',
      'Return the JSON array now.',
    ].filter(Boolean).join('\n'),
  });

  plans.forEach((sp, idx) => {
    const cluster = (knowledgeBase.clusters || []).find((x) => x.id === sp.clusterId);
    const units = (cluster?.unitIds || [])
      .map((id) => unitsById.get(id))
      .filter(Boolean)
      .map((u, i) => `  (${i + 1}) [${u.kind}] ${u.text}${u.from ? ` — ${u.from}` : ''}`)
      .join('\n');
    const useComposite = Array.isArray(sp.sectionRecipe) && sp.sectionRecipe.length > 0;
    const recipe = useComposite
      ? formatCompositeRecipe(sp.sectionRecipe)
      : formatFlatRecipe(sp.recipe || template.sectionBlockRecipe || []);
    const sectionDepth = sp.depth || c.dpth || 'Standard';
    const minWords = Math.round(perSection * 0.9);

    jobs.push({
      label: `Writing section ${idx + 1} of ${n}: ${sp.title}…`,
      maxTokens: tokensForWordBudget(perSection, 6144),
      system: sharedSystem + (anyComposite
        ? '\nIf recipe includes EMBEDDED_QUIZ, end with ONE section-quiz for this section only.'
        : `\nAfter teaching, emit ~${Math.max(chks, 1)} question part(s) testing ONLY this section.`),
      user: [
        `Tutorial title: ${title || '(untitled)'}`,
        `Overall objective: ${c.obj || '(none)'}`,
        `CHUNK: Section ${idx + 1} of ${n} only — "${sp.title}".`,
        sp.intent ? `Section intent: ${sp.intent}` : '',
        `Section depth: ${sectionDepth}`,
        sp.subheads?.length ? `Subheads: ${sp.subheads.join(' · ')}` : '',
        `Recipe: ${recipe}`,
        `HARD MINIMUM: at least ${minWords} words of rich-text body text in THIS chunk (target ~${perSection}).`,
        'Start with a rich-text whose heading is exactly the section title. Add more rich-text teaching parts as needed to hit the word minimum (multiple paragraphs each).',
        'SOURCE UNITS FOR THIS SECTION ONLY:',
        units || '  (empty — say so; still write pedagogical scaffolding without inventing contradicting facts)',
        mediaList.length ? `Media refs available: ${mediaList.map((m) => m.ref).join(', ')}` : '',
        'Do NOT emit Introduction, other sections, or Recap.',
        'Return the JSON array now.',
      ].filter(Boolean).join('\n'),
    });
  });

  if (end && end !== 'None') {
    jobs.push({
      label: 'Writing closing…',
      maxTokens: tokensForWordBudget(closeWords, 3072),
      system: sharedSystem,
      user: [
        `Tutorial title: ${title || '(untitled)'}`,
        `CHUNK: Closing only — End with: ${end}.`,
        end === 'Recap only'
          ? `Emit a Recap rich-text (heading "Recap") with at least ${Math.round(closeWords * 0.8)} words summarizing the tutorial.`
          : end === 'End quiz'
            ? 'Emit 2–3 knowledge-check question parts that span the whole tutorial.'
            : end === 'End assignment'
              ? 'Emit one assignment-style rich-text (heading Assignment).'
              : 'Emit an appropriate short closing rich-text.',
        'Do NOT emit earlier sections.',
        'Return the JSON array now.',
      ].join('\n'),
    });
  }

  return { jobs, wordTarget };
  */
}

/**
 * Expand the shortest rich-text bodies when a draft badly undershoots an explicit word target.
 */
async function expandUnderLengthTutorial(parts, body, target) {
  const list = Array.isArray(parts) ? [...parts] : [];
  const richIdx = list
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p?.type === 'rich-text' && String(p.body || '').trim())
    .sort((a, b) => String(a.p.body).length - String(b.p.body).length);

  // Expand up to 6 thinnest teaching parts.
  const toExpand = richIdx.slice(0, 6);
  if (!toExpand.length) return list;

  const remaining = Math.max(400, target - countTeachingWordsInParts(list));
  const per = Math.round(remaining / toExpand.length);
  const c = body?.config || {};
  const allowExtra = c.aiExtra === true;

  for (const { p, i } of toExpand) {
    const minWords = Math.max(220, per);
    const system = [
      'You expand ONE tutorial rich-text part to meet a HARD teaching-word minimum.',
      'Return ONLY a JSON object: {"type":"rich-text","label":string,"heading":string|null,"subheads":string[]|null,"body":string}.',
      'Keep the same heading/label. Lengthen the body with stepwise teaching and examples.',
      allowExtra
        ? 'You may add helpful pedagogical elaboration; do not contradict the existing body.'
        : 'Stay faithful to the existing body — elaborate and exemplify, do not invent contradicting facts.',
    ].join(' ');
    const user = [
      `HARD MINIMUM for this body: at least ${minWords} words.`,
      'Current part JSON:',
      JSON.stringify({
        type: 'rich-text',
        label: p.label,
        heading: p.heading || null,
        subheads: p.subheads || null,
        body: p.body,
      }, null, 2),
      '',
      'Return the expanded rich-text object now.',
    ].join('\n');
    try {
      const raw = await callAnthropic({
        system,
        user,
        maxTokens: tokensForWordBudget(minWords, 4096),
      });
      const parsed = extractJson(raw);
      const obj = Array.isArray(parsed) ? parsed[0] : parsed;
      const normalized = normalizePart({ ...obj, type: 'rich-text' }, i);
      if (normalized?.type === 'rich-text' && String(normalized.body || '').length > String(p.body || '').length) {
        list[i] = { ...normalized, id: p.id };
      }
    } catch {
      /* keep original part if expand fails */
    }
  }
  return list;
}

const ALLOWED_TYPES = new Set(['rich-text', 'concept-card', 'question', 'section-quiz']);

function normalizeQuestionSources(raw) {
  return normalizeMcqSources(raw);
}

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
  if (raw.type === 'section-quiz') {
    const rawQs = Array.isArray(raw.questions) ? raw.questions : [];
    const questions = rawQs.map((q) => {
      if (!q || typeof q !== 'object') return null;
      const options = Array.isArray(q.options) ? q.options.slice(0, 4).map(String) : [];
      while (options.length < 4) options.push(`Option ${options.length + 1}`);
      let correct = Number(q.correct);
      if (!Number.isInteger(correct) || correct < 0 || correct > 3) correct = 0;
      const hints = Array.isArray(q.hints)
        ? q.hints.map((h) => String(h || '').trim()).filter(Boolean)
        : [];
      const question = String(q.question || q.prompt || '').trim();
      if (!question) return null;
      const sources = normalizeQuestionSources(q.sources);
      return {
        question,
        options,
        correct,
        explanation: String(q.explanation || q.exp || ''),
        hints,
        label: typeof q.label === 'string' ? q.label : undefined,
        ...(sources ? { sources } : {}),
        ...(typeof q.imageUrl === 'string' && q.imageUrl ? { imageUrl: q.imageUrl } : {}),
        ...(typeof q.videoUrl === 'string' && q.videoUrl ? { videoUrl: q.videoUrl } : {}),
      };
    }).filter(Boolean);
    if (!questions.length) return null;
    return {
      id,
      type: 'section-quiz',
      label: label || 'Section quiz',
      sourceMode: String(raw.sourceMode || 'generate'),
      authoringNote: typeof raw.authoringNote === 'string' ? raw.authoringNote : undefined,
      required: raw.required !== false,
      questions,
    };
  }
  const options = Array.isArray(raw.options) ? raw.options.slice(0, 4).map(String) : [];
  while (options.length < 4) options.push(`Option ${options.length + 1}`);
  let correct = Number(raw.correct);
  if (!Number.isInteger(correct) || correct < 0 || correct > 3) correct = 0;
  const hints = Array.isArray(raw.hints)
    ? raw.hints.map((h) => String(h || '').trim()).filter(Boolean)
    : (typeof raw.hint === 'string' && raw.hint.trim() ? [raw.hint.trim()] : []);
  const sources = normalizeQuestionSources(raw.sources);
  return {
    id, type: 'question', label, prompt: String(raw.prompt || ''), options, correct,
    exp: String(raw.exp || ''),
    hints,
    ...(sources ? { sources } : {}),
  };
}

function renumberQuestionLabels(parts) {
  let n = 0;
  return parts.map((p) => {
    if (p.type === 'section-quiz' && Array.isArray(p.questions)) {
      return {
        ...p,
        questions: p.questions.map((q) => {
          n += 1;
          return { ...q, label: `Question ${n}` };
        }),
      };
    }
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

function formatUnitLine(unit, i) {
  const kind = unit?.kind || 'Key point';
  const from = unit?.from ? ` — ${unit.from}` : '';
  const { text, authorNote } = splitPassageAndNote(unit?.text, unit?.authorNote || unit?.comment);
  const note = authorNote
    ? `\n    ★ AUTHOR DIRECTIVE (mandatory — follow WORD FOR WORD for this exact passage): ${authorNote}`
    : '';
  return `(${i + 1}) [${kind}] ${text}${from}${note}`;
}

function extractLinesFrom(extracts) {
  if (!Array.isArray(extracts) || extracts.length === 0) return '(no marked-up PDF/source units provided)';
  return extracts.map((e, i) => formatUnitLine(e, i)).join('\n');
}

/** Collect markup notes so generation can obey them even if extracts omitted authorNote. */
function collectAuthorDirectives(body = {}) {
  const out = [];
  const push = (passage, note, tag, from) => {
    const authorNote = String(note || '').trim();
    const text = String(passage || '').trim();
    if (!authorNote || !text) return;
    out.push({ text, authorNote, tag: tag || 'Use', from });
  };
  if (Array.isArray(body.highlights)) {
    for (const h of body.highlights) {
      if (h?.tag === 'Ignore') continue;
      push(h.text, h.comment || h.authorNote, h.tag, h.from || h.sourceLabel);
    }
  }
  if (Array.isArray(body.extracts)) {
    for (const e of body.extracts) {
      const split = splitPassageAndNote(e.text, e.authorNote || e.comment);
      push(split.text, split.authorNote, e.kind, e.from);
    }
  }
  if (body.knowledgeBase?.units) {
    for (const u of body.knowledgeBase.units) {
      push(u.text, u.authorNote || u.comment, u.kind, u.from);
    }
  }
  if (Array.isArray(body.authorDirectives)) {
    for (const d of body.authorDirectives) push(d.text, d.authorNote || d.comment || d.note, d.tag, d.from);
  }
  // Hoot co-author chat instructions collected across the authoring pipeline.
  if (Array.isArray(body.authorInstructions)) {
    for (const t of body.authorInstructions) {
      const text = String(t || '').trim();
      if (text) push('(whole object)', text, 'hoot', 'Hoot co-author');
    }
  }
  // Dedupe by passage+note
  const seen = new Set();
  return out.filter((d) => {
    const key = `${normalizeTextKey(d.text)}::${normalizeTextKey(d.authorNote)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function authorDirectiveRules() {
  return [
    'AUTHOR DIRECTIVES (critical): When a content unit or list item carries an AUTHOR DIRECTIVE, you MUST follow that directive WORD FOR WORD for how you use THAT passage.',
    'Do not paraphrase away the directive. Do not ignore it. Apply it only to the paired passage (and teaching built from it), not to unrelated units.',
    'If a directive says what to do with the sentences (e.g. "use as worked example", "emphasize common mistake", "quote verbatim"), obey it exactly in the generated object.',
  ].join(' ');
}

function formatAuthorDirectivesBlock(directives) {
  if (!Array.isArray(directives) || !directives.length) return '';
  return [
    '--- AUTHOR DIRECTIVES (follow WORD FOR WORD for the paired passage) ---',
    ...directives.map((d, i) => (
      `(D${i + 1}) PASSAGE: ${d.text}\n     DIRECTIVE: ${d.authorNote}${d.from ? `\n     Source: ${d.from}` : ''}`
    )),
    '--- end author directives ---',
  ].join('\n');
}

/**
 * Text flashcards only (Key terms / Concept / Q→A).
 * Image → label is handled separately via vision on uploaded images.
 * Returns null when there are no text styles to generate.
 */
function buildFlashcardPrompt(body) {
  const { title, config, extracts, prompt } = body || {};
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
  const authorDirectives = collectAuthorDirectives(body);
  const directiveBlock = formatAuthorDirectivesBlock(authorDirectives);

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
    authorDirectives.length ? authorDirectiveRules() : '',
    'Output ONLY a JSON array of card objects. No prose, no markdown fences.',
    hooks
      ? 'Card shape: {"front":string,"back":string,"hook":string}  // hook = a short mnemonic / memory aid'
      : 'Card shape: {"front":string,"back":string}',
    'Front is the prompt (term/question/concept); back is the concise answer. Keep each side tight and self-contained.',
    `Use these Card content style(s): ${fmtList(styles, 'Key terms → definitions')}.`,
    'Do NOT create Image → label cards and do NOT include imageRef — images are handled separately.',
  ].filter(Boolean).join('\n');

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
    directiveBlock,
    '',
    '--- Content units from the PDF / source (primary material) ---',
    extractLines,
    '',
    `Produce EXACTLY ${nc} distinct, non-duplicate flashcards. Return the JSON array now.`,
  ].filter(Boolean).join('\n');

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

function buildQuizPrompt(body) {
  const { title, config, extracts, prompt } = body || {};
  const c = config || {};
  const num = (v, d) => (typeof v === 'number' ? v : Number(v) || d);
  const nq = Math.max(3, Math.min(20, num(c.nq, 8)));
  const writeExplanations = c.perq !== false;
  const adaptive = isAdaptiveQuiz(c);
  const hasExtracts = Array.isArray(extracts) && extracts.length > 0;
  const authorPrompt = prompt || '';
  const extractLines = extractLinesFrom(extracts);
  const authorDirectives = collectAuthorDirectives(body);
  const directiveBlock = formatAuthorDirectivesBlock(authorDirectives);

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
    authorDirectives.length ? authorDirectiveRules() : '',
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
  ].filter(Boolean).join('\n');

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
    c.passOn === false
      ? 'Scoring — no pass mark (practice only; do not invent a pass threshold in question text)'
      : `Scoring — pass mark: ${c.pass || '70%'} (metadata only; do not put this in question text)`,
    `Show explanations (learner UX): ${c.show || 'After attempt'} (metadata only)`,
    `Write per-question explanations: ${writeExplanations ? 'ON — include explanation on every question' : 'OFF — leave explanation empty'}`,
    authorPrompt ? `\nAuthor's prompt / description:\n${authorPrompt}` : '',
    directiveBlock,
    '',
    '--- Content units from the PDF / source ---',
    extractLines,
    '',
    `Produce EXACTLY ${nq} distinct, non-duplicate questions. Return the JSON array now.`,
  ].filter(Boolean).join('\n');

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
  const push = (text, from, kind, authorNote) => {
    const split = splitPassageAndNote(text, authorNote);
    const t = split.text;
    if (!t || t.length < 8) return;
    const key = t.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) {
      const hit = out.find((o) => o.text.toLowerCase().replace(/\s+/g, ' ') === key);
      if (hit && split.authorNote && !hit.authorNote) hit.authorNote = split.authorNote;
      return;
    }
    seen.add(key);
    out.push({
      id: `u${out.length + 1}`,
      text: t,
      authorNote: split.authorNote,
      from: from ? String(from) : '',
      kind: kind || 'Source',
    });
  };
  if (Array.isArray(extracts)) {
    for (const e of extracts) push(e?.text, e?.from, e?.kind || 'Extract', e?.authorNote || e?.comment);
  }
  // Concept cards: when markup/extracts exist, do NOT fall back to the whole PDF.
  if (!markupOnly && Array.isArray(sourceUnits)) {
    for (const u of sourceUnits) {
      const from = u?.from || (u?.page != null ? `p.${u.page}` : '');
      push(u?.text, from, u?.kind || 'Source', u?.authorNote || u?.comment);
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
    const note = u.authorNote
      ? `\n★ AUTHOR DIRECTIVE (follow WORD FOR WORD for this passage): ${u.authorNote}`
      : '';
    return `(${i + 1}) id=${u.id}${cite}\n${u.text}${note}`;
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

function normalizeConceptCard(raw, prev = {}, { views, categories } = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const term = String(raw.term || raw.concept || prev.term || '').trim();
  if (!term) return null;

  const str = (...keys) => {
    for (const k of keys) {
      if (typeof raw[k] === 'string' && raw[k].trim()) return raw[k].trim();
      if (typeof prev[k] === 'string' && prev[k].trim()) return prev[k].trim();
    }
    return '';
  };

  const oneSentenceMeaning = str('oneSentenceMeaning', 'definition', 'plain');
  const coreIdea = str('coreIdea', 'definition', 'oneSentenceMeaning', 'plain');
  if (!oneSentenceMeaning && !coreIdea) return null;

  let keyComponents = [];
  const rawComp = raw.keyComponents ?? prev.keyComponents;
  if (Array.isArray(rawComp)) {
    keyComponents = rawComp.map((x) => String(x || '').trim()).filter(Boolean);
  } else if (typeof rawComp === 'string' && rawComp.trim()) {
    keyComponents = rawComp.split(/\n|•|;/).map((s) => s.replace(/^[-*\d.)\s]+/, '').trim()).filter(Boolean);
  }

  const cats = Array.isArray(categories) && categories.length
    ? categories
    : (Array.isArray(raw.categories) ? raw.categories : (Array.isArray(prev.categories) ? prev.categories : null));

  const extraFromRaw = Array.isArray(raw.extraSections) ? raw.extraSections : [];
  const extraFromPrev = Array.isArray(prev.extraSections) ? prev.extraSections : [];
  const extraMap = new Map();
  for (const s of [...extraFromPrev, ...extraFromRaw]) {
    if (!s || typeof s !== 'object') continue;
    const id = String(s.id || '').trim();
    const title = String(s.title || s.label || '').trim();
    const body = String(s.body || s.text || '').trim();
    if (!id || !title) continue;
    extraMap.set(id, { id, title, body });
  }
  // Also accept custom fields as top-level keys matching category ids
  if (Array.isArray(cats)) {
    for (const cat of cats) {
      if (!cat?.id || !String(cat.id).startsWith('custom-')) continue;
      if (typeof raw[cat.id] === 'string' && raw[cat.id].trim()) {
        extraMap.set(cat.id, {
          id: cat.id,
          title: String(cat.label || cat.id),
          body: raw[cat.id].trim(),
        });
      }
    }
  }

  const out = {
    id: prev.id || `cc${Date.now()}`,
    term,
    oneSentenceMeaning: oneSentenceMeaning || coreIdea,
    whyItMatters: str('whyItMatters', 'analogy'),
    coreIdea: coreIdea || oneSentenceMeaning,
    keyComponents,
    example: str('example', 'workedExample'),
    nonExample: str('nonExample'),
    visualOrFormula: str('visualOrFormula', 'visualSuggestion', 'visual'),
    visualChoice: str('visualChoice') || undefined,
    visualAlternative: str('visualAlternative') || undefined,
    visualFormula: str('visualFormula') || undefined,
    commonMistake: str('commonMistake', 'misconception', 'misc'),
    connection: str('connection'),
    recallQuestion: str('recallQuestion'),
    teachBack: str('teachBack'),
    categories: cats || undefined,
    extraSections: [...extraMap.values()],
    definition: oneSentenceMeaning || coreIdea,
    analogy: str('whyItMatters', 'analogy') || undefined,
    visualSuggestion: str('visualOrFormula', 'visualSuggestion', 'visual') || undefined,
    misconception: str('commonMistake', 'misconception', 'misc') || undefined,
    includedViews: Array.isArray(views) && views.length ? views : [
      'definition', 'analogy', 'example', 'visual', 'misconception',
    ],
  };

  if (!out.visualChoice && !out.visualAlternative && !out.visualFormula && out.visualOrFormula) {
    out.visualFormula = out.visualOrFormula;
  }

  const cites = (raw.citations && typeof raw.citations === 'object') ? raw.citations : {};
  const prevCites = (prev.citations && typeof prev.citations === 'object') ? prev.citations : {};
  const citations = { ...prevCites, ...cites };
  const cleaned = {};
  for (const [k, v] of Object.entries(citations)) {
    if (typeof v === 'string' && v.trim()) cleaned[k] = v.trim();
  }
  if (Object.keys(cleaned).length) out.citations = cleaned;

  if (typeof raw.voice === 'string' && raw.voice.trim()) out.voice = raw.voice.trim();
  else if (prev.voice) out.voice = prev.voice;
  if (typeof raw.length === 'string' && raw.length.trim()) out.length = raw.length.trim();
  else if (prev.length) out.length = prev.length;

  return out;
}

function buildConceptCardPrompt({ title, config, retrieved, views, prompt }) {
  void views;
  const c = config || {};
  const len = c.len || 'Standard';
  const aud = c.aud || 'High school';
  const lvl = c.lvl || 'Basic';
  const voi = c.voi || 'Plain & friendly';
  const intent = String(c.concept || title || '').trim();
  const cats = Array.isArray(c.categories) ? c.categories.filter((x) => x && x.enabled !== false) : [];
  const enabled = cats.length
    ? cats
    : [
        { id: 'meaning', label: 'One-sentence meaning' },
        { id: 'why', label: 'Why it matters' },
        { id: 'core', label: 'Core idea' },
        { id: 'components', label: 'Key components' },
        { id: 'example', label: 'Example' },
        { id: 'nonExample', label: 'Non-example' },
        { id: 'visual', label: 'Visual or formula' },
        { id: 'mistake', label: 'Common mistake' },
        { id: 'connection', label: 'Connection' },
        { id: 'recall', label: 'Recall question' },
        { id: 'teachBack', label: 'Teach-back (explain in 30 seconds)' },
      ];

  const fieldGuide = {
    meaning: 'oneSentenceMeaning (string) — a single clear sentence defining the concept as the source does.',
    why: 'whyItMatters (string) — why a learner should care / when it shows up.',
    core: 'coreIdea (string) — the deeper explanation (a short paragraph).',
    components: 'keyComponents (string[]) — 2–5 short bullet phrases naming the parts / conditions.',
    example: 'example (string) — a concrete positive instance from the source.',
    nonExample: 'nonExample (string) — what it is NOT — a near-miss that clarifies the boundary.',
    visual: 'visualChoice / visualAlternative / visualFormula (strings) — tiny choice→gives-up→alternative labels plus a one-line formula.',
    mistake: 'commonMistake (string) — a real learner mistake, then the correction.',
    connection: 'connection (string) — how this links to a neighbouring idea in the source.',
    recall: 'recallQuestion (string) — one short check question (no answer key needed).',
    teachBack: 'teachBack (string) — a 30-second spoken explanation the learner could say aloud.',
  };

  const requestedFields = [];
  const customIds = [];
  for (const cat of enabled) {
    const id = String(cat.id || '');
    if (fieldGuide[id]) requestedFields.push(`- ${cat.label}: ${fieldGuide[id]}`);
    else if (id.startsWith('custom-')) {
      customIds.push({ id, label: String(cat.label || id) });
      requestedFields.push(`- ${cat.label}: put the body in extraSections as {"id":"${id}","title":"${String(cat.label || id).replace(/"/g, '')}","body":string}`);
    }
  }

  const system = [
    'You generate ONE pedagogical concept card as STRUCTURED JSON for learners.',
    'CRITICAL GROUNDING RULE: Every field MUST be defined by what the retrieved source chunks say about the concept.',
    'If the source is about the card game Bridge, every field is about the card game — full stop. Never invent a different sense.',
    'Do NOT use outside knowledge that contradicts or replaces the source.',
    authorDirectiveRules(),
    'Output ONLY a single JSON object. No prose, no markdown fences.',
    'Include "term" plus ONLY the fields for the requested categories below.',
    'Also include "extraSections": array (may be empty) for any custom categories.',
    'Also include "citations": object mapping field names → short cite using chunk ids/from labels.',
    'Requested categories / fields:',
    ...requestedFields,
    lengthBudget(len),
    readingLevelRules(aud, lvl),
    `Voice (${voi}): tone ONLY — warm, second-person-ish, not lecturing.`,
  ].join('\n');

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
    `Length per section: ${len}`,
    `Categories to fill (${enabled.length}): ${enabled.map((x) => x.label).join(' · ')}`,
    customIds.length
      ? `Custom category ids: ${customIds.map((x) => `${x.id} (${x.label})`).join(', ')}`
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
    ? `GROUNDING: Build ONLY from the marked-up source units and Define settings. Do not invent unsupported material. ${authorDirectiveRules()}`
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

function buildSummaryPrompt(body) {
  const { title, config, extracts, prompt } = body || {};
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
    formatAuthorDirectivesBlock(collectAuthorDirectives(body)),
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

function buildReflectionPrompt(body) {
  const { title, config, extracts, prompt } = body || {};
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
    formatAuthorDirectivesBlock(collectAuthorDirectives(body)),
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

function buildAssignmentPrompt(body) {
  const { title, config, extracts, prompt } = body || {};
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
    formatAuthorDirectivesBlock(collectAuthorDirectives(body)),
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
    const whyCorrect = String(it?.whyCorrect || it?.why || it?.explanation || '').trim() || undefined;
    let corrections;
    if (it?.corrections && typeof it.corrections === 'object' && !Array.isArray(it.corrections)) {
      corrections = Object.fromEntries(
        Object.entries(it.corrections)
          .map(([k, v]) => [String(k).trim(), String(v || '').trim()])
          .filter(([k, v]) => k && v),
      );
      if (!Object.keys(corrections).length) corrections = undefined;
    }
    return {
      id: it?.id || `di${i + 1}`,
      prompt,
      answer,
      choices: choices && choices.length >= 2 ? choices : undefined,
      whyCorrect,
      corrections,
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

function buildDrillPrompt(body) {
  const { title, config, extracts, prompt } = body || {};
  const c = config || {};
  const ni = Math.max(5, Math.min(30, Number(c.ni) || 15));
  const fmt = c.fmt || 'Recall';
  const system = [
    'You generate ONE drill (rapid practice set) as STRUCTURED JSON.',
    groundingFromExtracts(extracts, 'No marked-up units — build from Define (skill, practice design) and the author prompt.'),
    'Output ONLY a JSON object. No prose, no markdown fences.',
    'Shape: {"skill":string,"format":string,"difficultyCurve":string,"feedback":string,"timed":boolean,"repeatUntilMastery":boolean,"items":[{"id":string,"prompt":string,"answer":string,"choices":string[]|null,"whyCorrect":string,"corrections":{"wrongAnswer":"specific correction"}|null,"hint":string|null,"difficulty":"easy"|"medium"|"hard"|null}]}',
    `Write exactly ${ni} items in format "${fmt}".`,
    /recognition/i.test(fmt)
      ? 'Recognition: each item needs 3–4 choices including the correct answer.'
      : /application/i.test(fmt)
        ? 'Application: each item must make the learner APPLY the skill on a fresh instance (compute, decide, compare) — not recite a rule. Prefer short typed answers; choices only when the decision is categorical (e.g. made/failed).'
        : 'Recall: answer is the expected typed response; choices may be null.',
    'Every item needs whyCorrect (1–2 sentences explaining the right answer). For likely wrong answers, fill corrections keyed by that wrong answer text with a targeted mistake explanation.',
    `Difficulty curve: ${c.diff || 'Easy → hard'}. Tag items easy/medium/hard accordingly. Feedback mode: ${c.fb || 'Immediate'}.`,
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
    formatAuthorDirectivesBlock(collectAuthorDirectives(body)),
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
      'You are editing ONE pedagogical concept card for a course author.',
      'Return ONLY a JSON object — no prose, no markdown fences.',
      'Shape: {"term":string,"oneSentenceMeaning":string,"whyItMatters":string,"coreIdea":string,"keyComponents":string[],"example":string,"nonExample":string,"visualChoice":string,"visualAlternative":string,"visualFormula":string,"commonMistake":string,"connection":string,"recallQuestion":string,"teachBack":string}',
      'Keep the same concept unless the instruction changes it. Preserve accuracy and fill every template field.',
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
  if (prev.videoUrl) out.videoUrl = prev.videoUrl;
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

/** Request handler — exported so Vercel serverless (api/index.mjs) can reuse it. */
export async function handler(req, res) {
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

  /* ---- Tutorial: website page → sentences ---- */
  if (method === 'POST' && path === '/api/tutorials/ingest-web') {
    const body = await readJson(req);
    if (!body.url) return send(res, 400, { code: 'no_url', message: 'Provide a website URL.' });
    try {
      const out = await fetchWebsitePage(body.url);
      return send(res, 200, out);
    } catch (e) {
      const status = e instanceof LlmError ? e.status : 500;
      return send(res, status, { code: e.code || 'error', message: e.message });
    }
  }

  /* ---- Publish a submitted learning object to the shared Nexus Supabase ---- */
  if (method === 'POST' && path === '/api/learning/publish') {
    const body = await readJson(req);
    try {
      const out = await publishLearningObjectRow(body.object || body, !!body.share);
      return send(res, 200, out);
    } catch (e) {
      const status = e instanceof LlmError ? e.status : 500;
      return send(res, status, { code: e.code || 'error', message: e.message });
    }
  }

  /* ---- Tutorial: website image → inline data URI (image picker) ---- */
  if (method === 'POST' && path === '/api/tutorials/fetch-image') {
    const body = await readJson(req);
    if (!body.url) return send(res, 400, { code: 'no_url', message: 'Provide an image URL.' });
    try {
      const out = await fetchWebsiteImageAsDataUri(body.url);
      return send(res, 200, out);
    } catch (e) {
      const status = e instanceof LlmError ? e.status : 500;
      return send(res, status, { code: e.code || 'error', message: e.message });
    }
  }

  /* ---- Tutorial: expand AI prompt into markable source text ---- */
  if (method === 'POST' && path === '/api/tutorials/expand-prompt') {
    const body = await readJson(req);
    try {
      const result = await expandPromptToSource(body.prompt, {
        title: body.title,
        objective: body.objective,
      });
      return send(res, 200, result);
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
        sections: body.sections,
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
        const normalized = normalizeConceptCard(obj, item, {});
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
      if (item.imageUrl && !normalized.imageUrl) normalized.imageUrl = item.imageUrl;
      if (item.videoUrl && !normalized.videoUrl) normalized.videoUrl = item.videoUrl;
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
        message: `Grounded in ${hits.length} marked-up unit${hits.length === 1 ? '' : 's'} (score ${bestScore.toFixed(1)}). Filling the concept-card template…`,
      });

      const { system, user } = buildConceptCardPrompt({
        title: body?.title,
        config,
        retrieved: hits,
        views,
        prompt: body?.prompt,
      });
      sseSend(res, { type: 'progress', message: 'Writing the full template with the model…' });
      const raw = await callAnthropic({ system, user, maxTokens: 6144 });
      const parsed = extractJson(raw);
      const obj = Array.isArray(parsed) ? parsed[0] : parsed;
      const card = normalizeConceptCard(obj, {}, { views, categories: config.categories });
      if (!card) throw new LlmError(502, 'llm_parse', 'The model did not return a usable concept card.');
      if (config.voi) card.voice = String(config.voi);
      if (config.len) card.length = String(config.len);
      if (Array.isArray(config.categories)) card.categories = config.categories;
      if (!card.citations) card.citations = {};
      const fallbackCite = hits.slice(0, 2).map((h) => h.from || h.id).filter(Boolean).join('; ');
      if (fallbackCite && !Object.keys(card.citations).length) {
        card.citations.coreIdea = fallbackCite;
        card.citations.oneSentenceMeaning = fallbackCite;
      }
      sseSend(res, { type: 'progress', message: 'Assembling the concept card sheet…' });
      sseSend(res, { type: 'card', card });
      sseSend(res, { type: 'done' });
    } catch (e) {
      sseSend(res, { type: 'error', code: e.code || 'error', message: e.message || 'Generation failed.' });
    }
    return sseDone(res);
  }

  /* ---- Video scripts: generate checkpoints from YouTube transcript ---- */
  if (method === 'POST' && path === '/api/video-scripts/generate') {
    const body = await readJson(req);
    sseStart(res);
    try {
      sseSend(res, { type: 'progress', message: 'Reading the video transcript and Define settings…' });
      let segments = Array.isArray(body?.transcriptSegments) ? body.transcriptSegments : [];
      let videoTitle = body?.videoTitle || '';
      let videoId = body?.videoId || parseVideoId(body?.videoUrl || '') || '';
      const videoUrl = body?.videoUrl || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : '');

      if ((!segments.length || !videoId) && videoUrl) {
        sseSend(res, { type: 'progress', message: 'Fetching captions from YouTube…' });
        const ingested = await fetchYoutubeTranscript(videoUrl);
        segments = ingested.segments || [];
        videoTitle = videoTitle || ingested.title || '';
        videoId = videoId || ingested.videoId || parseVideoId(videoUrl) || '';
      }
      if (!videoId) {
        throw new LlmError(400, 'no_video', 'Provide a YouTube video URL in Sources.');
      }

      const { system, user, ncp } = buildVideoScriptPrompt({
        title: body?.title,
        config: body?.config,
        extracts: body?.extracts,
        prompt: body?.prompt,
        transcriptSegments: segments,
        videoTitle,
      });
      sseSend(res, { type: 'progress', message: `Writing ${ncp} checkpoint questions…` });
      const raw = await callAnthropic({ system, user, maxTokens: 8192 });
      const parsed = extractJson(raw);
      const arr = Array.isArray(parsed?.checkpoints) ? parsed.checkpoints
        : Array.isArray(parsed) ? parsed
          : [];
      const durationHint = segments.length
        ? Math.max(...segments.map((s) => Number(s.end || s.start) || 0))
        : 0;
      let checkpoints = arr
        .map((c, i) => normalizeVideoScriptCheckpoint(c, i, durationHint))
        .filter(Boolean)
        .sort((a, b) => a.time - b.time);

      // Ensure distinct times if the model clustered them.
      for (let i = 1; i < checkpoints.length; i++) {
        if (checkpoints[i].time < checkpoints[i - 1].time + 8) {
          checkpoints[i] = { ...checkpoints[i], time: checkpoints[i - 1].time + 8 };
        }
      }

      if (checkpoints.length === 0) {
        throw new LlmError(502, 'llm_no_checkpoints', 'The model did not return any usable checkpoints. Try again.');
      }

      const transcript = (segments.length ? segments : []).map((s, i) => ({
        id: s.id || `seg-${i + 1}`,
        start: Number(s.start) || 0,
        end: s.end != null ? Number(s.end) : undefined,
        text: String(s.text || '').trim(),
      })).filter((s) => s.text);

      const content = {
        provider: 'youtube',
        videoUrl: videoUrl || `https://www.youtube.com/watch?v=${videoId}`,
        videoId,
        title: body?.title || videoTitle || '',
        transcript,
        checkpoints,
        showTranscript: body?.config?.showTranscript !== false,
        enableChat: body?.config?.enableChat !== false,
        requireAnswer: body?.config?.requireAnswer !== false,
      };

      sseSend(res, { type: 'progress', message: `Assembling ${checkpoints.length} checkpoints…` });
      sseSend(res, { type: 'result', content });
      sseSend(res, { type: 'done', count: checkpoints.length });
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
      const passOn = body?.config?.passOn !== false && body?.config?.passOn !== 'No';
      sseSend(res, {
        type: 'done',
        count: questions.length,
        passRequired: passOn,
        passMark: passOn ? parsePassMark(body?.config?.pass) : undefined,
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
      const def = body?.tutorialDefinition;
      const hasDefSections = Array.isArray(def?.sections) && def.sections.some((s) => s && String(s.title || '').trim());
      let kb;
      if (hasDefSections) {
        // Tutorial define-first: fixed clusters = Plan sections (+ Unassigned). Never invent cluster names.
        kb = buildClusteredKnowledgeBaseFromDefinition({
          highlights: body?.highlights,
          extracts: body?.extracts,
          tutorialDefinition: def,
        });
      } else {
        kb = buildClusteredKnowledgeBase({
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
    // Server-side belt: tutorials never allow AI extras (ignore stale clients / old drafts).
    if (body && typeof body === 'object') {
      body.config = { ...(body.config || {}), aiExtra: false, words: 0 };
    }
    sseStart(res);
    try {
      const hasPlans = Array.isArray(body?.sectionPlans) && body.sectionPlans.length > 0;
      sseSend(res, {
        type: 'progress',
        message: hasPlans
          ? 'Mapping template sections to source clusters…'
          : 'Reading your extracts and settings…',
      });

      const chunked = buildTutorialChunkJobs(body);
      let parts = [];

      if (chunked?.jobs?.length) {
        sseSend(res, {
          type: 'progress',
          message: `Long target (~${chunked.wordTarget} words) — writing section-by-section so length isn’t truncated…`,
        });
        for (const job of chunked.jobs) {
          sseSend(res, { type: 'progress', message: job.label });
          const raw = await callAnthropic({
            system: job.system,
            user: job.user,
            maxTokens: job.maxTokens,
          });
          const parsed = extractJson(raw);
          const arr = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' ? [parsed] : []);
          const chunkParts = arr.map((p, i) => normalizePart(p, parts.length + i)).filter(Boolean);
          parts.push(...chunkParts);
        }
      } else {
        const { system, user, secs } = buildGeneratePrompt(body);
        const sectionCount = secs || (typeof body?.config?.secs === 'number' ? body.config.secs : 3);
        const depthLabel = String(body?.config?.dpth || 'Standard');
        let maxTokens = sectionCount >= 12 ? 32768 : sectionCount >= 6 ? 16384 : sectionCount >= 4 ? 12288 : 8192;
        // Soft ceiling from depth × sections only (never a model-facing word target).
        maxTokens = Math.max(
          maxTokens,
          tokensForWordBudget(resolveTutorialWordTarget({ secs: sectionCount, dpth: depthLabel }), maxTokens),
        );
        sseSend(res, {
          type: 'progress',
          message: `Drafting from your sections at ${depthLabel} depth…`,
        });
        const raw = await callAnthropic({ system, user, maxTokens });
        const parsed = extractJson(raw);
        const arr = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' ? [parsed] : []);
        parts = arr.map((p, i) => normalizePart(p, i)).filter(Boolean);
      }

      const assess = body?.template?.assessmentPlacement || 'after_each_section';
      const chks = typeof body?.config?.chks === 'number' ? body.config.chks : 1;
      parts = orderTutorialParts(parts, { assessmentPlacement: assess, checksPerSection: chks });
      const hintOpts = resolveHintSettings(body?.config || {});
      parts = attachHintsToQuestionParts(parts, hintOpts);
      parts = attachSourcesToQuestionParts(parts, body?.knowledgeBase);
      parts = renumberQuestionLabels(parts);
      if (parts.length === 0) throw new LlmError(502, 'llm_no_parts', 'The model did not return any usable parts. Try again.');

      sseSend(res, {
        type: 'progress',
        message: `Assembling ${parts.length} parts…`,
      });
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
    const history = Array.isArray(body?.history) ? body.history.slice(-40) : [];
    const quickAction = body?.quickAction || null;
    const attachedImages = Array.isArray(body?.attachedImages)
      ? body.attachedImages.filter((img) => img && img.id && img.url).slice(0, 6)
      : [];

    sseStart(res);
    try {
      if (!message) throw new LlmError(400, 'no_message', 'Ask a question or describe an edit.');
      if (!context || !context.objectId) {
        throw new LlmError(400, 'no_context', 'No object context — open a learning object in the editor.');
      }

      sseSend(res, {
        type: 'status',
        message: attachedImages.length ? 'Looking at your attached images…' : 'Reading this object’s context…',
      });

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

      const attachedLines = attachedImages.map((img, i) =>
        `- [${i}] id=${img.id} name=${img.name || 'image'} caption=${img.caption || '(none)'} → use url "__ATTACHED_IMAGE_${i}__" or imageRef "${img.id}"`,
      ).join('\n');

      const meta = context.metadata || {};
      const system = [
        'You are Hoot, the LAIC course-developer Object Assistant — a co-author for ONE open learning object.',
        'CRITICAL RULES:',
        '- Use ONLY the provided object context (blocks, metadata, extracts/clusters) and any author-attached images. Never invent source citations.',
        '- Never claim you already edited the object. Edits must be proposals the developer accepts.',
        '- If the request is outside this object, refuse and explain.',
        '- If ambiguous, ask ONE concise clarifying question (mode=clarify) and omit proposal.',
        '- Cite block ids like [blk-…] when referencing content.',
        '- Prefer scoping edits to the current selection.',
        '- MEMORY: The conversation history is the author’s instruction record across the whole pipeline (Sources → Markup → Extract → Define → Editor). Treat EVERY prior user message as a standing instruction unless they clearly supersede it. Summarize and honor earlier preferences when proposing edits or answering.',
        '- When blocks are empty (still in the create pipeline), help with sourcing, markup focus, extract shaping, and Define settings; record instructions that generation must follow later. You cannot insert image blocks until the draft has blocks — say so clearly.',
        '',
        'ATTACHED IMAGES:',
        '- When the author attaches images and asks to place them (e.g. "add these images where you recommend"), you MUST propose mode=proposal with one add_block per image.',
        '- Look at each attached image (vision) and choose the best atIndex in the current BLOCKS list (0 = before first block, N = after last).',
        '- Prefer placing after the teaching block the image illustrates; avoid clustering all images at the end unless that is clearly best.',
        '- For each image: action = { "type":"add_block", "atIndex":number, "blockType":"image", "label":"Image", "content": { "url":"__ATTACHED_IMAGE_N__", "caption": string, "imageRef": "<id>" }, "reason": string }',
        '- NEVER invent image URLs. Only use __ATTACHED_IMAGE_N__ placeholders or the provided imageRef ids.',
        '- Write a short learner-facing caption grounded in what you see + nearby blocks.',
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
        'For add_block image content: {url:"__ATTACHED_IMAGE_N__",caption,imageRef}.',
        'STUDENT PAGES: on Review, block labels may end with "· page N" — the learner page the block sits on.',
        'To move a block to another page (e.g. "put the quiz on page 1"), propose update_block {blockId, patch:{"page": N}}.',
        'The block lands at the end of that page; use page = last page + 1 for a brand-new page. Do NOT use reorder_blocks for page moves.',
      ].join('\n');

      const historyLines = history
        .filter((h) => h && (h.role === 'user' || h.role === 'assistant') && h.content)
        .map((h) => `${h.role}: ${h.content}`)
        .join('\n');

      const userText = [
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
        'BLOCKS (index = atIndex target; length = insert at end):',
        blockLines || '(no blocks — cannot place images until a draft exists)',
        `Block count: ${blocks.length}`,
        '',
        attachedLines ? `Author-attached images this turn:\n${attachedLines}` : 'Author-attached images this turn: (none)',
        '',
        historyLines ? `Prior conversation (binding author instructions throughout the pipeline):\n${historyLines}\n` : '',
        `Developer message: ${message}`,
        '',
        attachedImages.length
          ? 'If the developer asked to place images, return mode=proposal with one image add_block per attached image.'
          : '',
        'Respond with the JSON object now.',
      ].filter(Boolean).join('\n');

      const userContent = [];
      for (const img of attachedImages) {
        const source = toAnthropicImageSource(img.url);
        if (source) userContent.push({ type: 'image', source });
      }
      userContent.push({ type: 'text', text: userText });

      sseSend(res, { type: 'status', message: 'Thinking…' });
      const raw = await callAnthropic({
        system,
        user: userContent.length > 1 ? userContent : userText,
        maxTokens: 4096,
      });
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

      const byId = new Map(attachedImages.map((img) => [String(img.id), img]));
      const resolveImageContent = (content) => {
        const c = content && typeof content === 'object' ? { ...content } : {};
        const ref = String(c.imageRef || c.ref || c.attachedId || '').trim();
        if (ref && byId.has(ref)) {
          const img = byId.get(ref);
          return {
            url: img.url,
            caption: String(c.caption || img.caption || img.name || '').trim(),
          };
        }
        const url = String(c.url || '');
        const m = url.match(/__ATTACHED_IMAGE_(\d+)__/i)
          || url.match(/^ATTACHED:(\d+)$/i)
          || url.match(/^ATTACHED:(.+)$/i);
        if (m) {
          const key = m[1];
          const img = /^\d+$/.test(key) ? attachedImages[Number(key)] : byId.get(key);
          if (img) {
            return {
              url: img.url,
              caption: String(c.caption || img.caption || img.name || '').trim(),
            };
          }
        }
        if (!url && attachedImages.length === 1) {
          return {
            url: attachedImages[0].url,
            caption: String(c.caption || attachedImages[0].caption || attachedImages[0].name || '').trim(),
          };
        }
        // Keep https/data urls the model copied from context blocks; drop inventing.
        if (/^(https?:|data:image\/)/i.test(url)) {
          return { url, caption: String(c.caption || '').trim() };
        }
        return c;
      };
      const remapAction = (action) => {
        if (!action || typeof action !== 'object') return action;
        if (action.type === 'batch' && Array.isArray(action.actions)) {
          return { ...action, actions: action.actions.map(remapAction) };
        }
        if (action.type === 'add_block' && /image/i.test(String(action.blockType || ''))) {
          return { ...action, content: resolveImageContent(action.content) };
        }
        return action;
      };

      let proposal = null;
      if (mode === 'proposal' && parsed?.proposal && Array.isArray(parsed.proposal.diffs) && parsed.proposal.diffs.length) {
        const propId = `prop-${Date.now()}`;
        const diffs = parsed.proposal.diffs
          .filter((d) => d && d.action && d.action.type)
          .map((d, i) => {
            const action = remapAction(d.action);
            const isImage = action?.type === 'add_block' && /image/i.test(String(action.blockType || ''));
            const caption = isImage ? String(action.content?.caption || '') : '';
            return {
              id: `diff-${Date.now()}-${i}`,
              kind: ['text', 'structural', 'metadata', 'batch_item'].includes(d.kind) ? d.kind : (isImage ? 'structural' : 'text'),
              summary: String(d.summary || (isImage ? `Add image${caption ? `: ${caption}` : ''}` : 'Proposed change')),
              beforeText: isImage ? '(none)' : (d.beforeText != null ? String(d.beforeText) : undefined),
              afterText: isImage
                ? (caption ? `Image: ${caption}` : 'Image block')
                : (d.afterText != null ? String(d.afterText) : undefined),
              blockId: d.blockId != null ? String(d.blockId) : (action?.blockId || undefined),
              action,
            };
          })
          // Drop image placements that still have no usable url after remap.
          .filter((d) => {
            if (d.action?.type === 'add_block' && /image/i.test(String(d.action.blockType || ''))) {
              return !!(d.action.content && d.action.content.url);
            }
            return true;
          });
        if (diffs.length) {
          proposal = {
            id: propId,
            messageId: msgId,
            status: 'pending',
            title: String(parsed.proposal.title || (attachedImages.length ? 'Place images' : 'Proposed edits')),
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
    const videoAsk = !!body.videoAsk;
    if (!message) return send(res, 400, { code: 'no_message', message: 'Ask a question.' });
    if (!context) return send(res, 400, { code: 'no_context', message: 'No learning-object content to ground the answer.' });

    const historyLines = history
      .filter((h) => h && (h.role === 'user' || h.role === 'assistant') && h.content)
      .map((h) => `${h.role === 'user' ? 'Learner' : 'Hoot'}: ${h.content}`)
      .join('\n');

    if (videoAsk) {
      const currentTime = Number(body.currentTime);
      const system = [
        'You are Hoot, a friendly study tutor for an interactive video lesson.',
        `Answer ONLY from the timed transcript / checkpoints for "${title}".`,
        'Output ONLY a JSON object (no markdown fences, no prose outside JSON):',
        '{"reply":string,"timestamps":number[]}',
        'reply rules:',
        '- Clear, encouraging, well-structured. Short paragraphs and - bullet lists when listing items.',
        '- You may wrap key terms in **double asterisks** for bold (the UI renders them; learners will not see the asterisks).',
        '- Do NOT use bare asterisks for emphasis without closing pairs. Do not use headings or code fences.',
        '- Do not invent facts outside the transcript.',
        'timestamps rules:',
        '- Include 1–3 video times in SECONDS (numbers) that best support the answer, taken from transcript [m:ss] labels.',
        '- Prefer the moment where the idea is explained. Always include at least one timestamp when the transcript has times.',
      ].join(' ');

      const user = [
        `Learning object: ${title}`,
        Number.isFinite(currentTime) ? `Learner is currently around ${Math.round(currentTime)}s in the video.` : '',
        '',
        '=== TIMED TRANSCRIPT + CHECKPOINTS (your only knowledge source) ===',
        context.slice(0, 14000),
        '=== END ===',
        historyLines ? `\nRecent conversation:\n${historyLines}\n` : '',
        `Learner question: ${message}`,
        '',
        'Return the JSON object now.',
      ].filter(Boolean).join('\n');

      try {
        const raw = await callAnthropic({ system, user, maxTokens: 1024 });
        let reply = '';
        let timestamps = [];
        try {
          const parsed = extractJson(raw);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            reply = String(parsed.reply || '').trim();
            timestamps = Array.isArray(parsed.timestamps)
              ? parsed.timestamps.map((t) => Number(t)).filter((t) => Number.isFinite(t) && t >= 0)
              : [];
          }
        } catch { /* fall through */ }
        if (!reply) {
          // Model returned plain text — still usable.
          reply = String(raw || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
        }
        // Dedupe / sort timestamps
        timestamps = [...new Set(timestamps.map((t) => Math.round(t * 10) / 10))].sort((a, b) => a - b).slice(0, 3);
        return send(res, 200, { reply, timestamps });
      } catch (e) {
        const status = e instanceof LlmError ? e.status : 500;
        return send(res, status, { code: e.code || 'error', message: e.message });
      }
    }

    const system = [
      'You are Hoot, a friendly study tutor owl for the LAIC learning platform.',
      `You may ONLY answer using the content of the learning object titled "${title}".`,
      'If the question is outside that content, say you can only help with this object and briefly point them back to what it covers.',
      'Be concise, clear, and encouraging. Use short paragraphs. Do not invent facts beyond the provided content.',
      'You may use light markdown: **bold** for key terms, and - bullet lists. Do not use headings or code fences.',
    ].join(' ');

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
}

const server = createServer(handler);

// Vercel imports the handler; only local dev binds a port.
if (!process.env.VERCEL) server.listen(PORT, () => {
  console.log(`\nLAIC dev backend → http://localhost:${PORT}`);
  console.log(`LLM: ${ANTHROPIC_API_KEY ? `enabled (model ${LLM_MODEL})` : 'DISABLED — set ANTHROPIC_API_KEY in .env'}`);
  console.log('Tutorial: POST /api/tutorials/ingest-web · POST /api/tutorials/ingest-youtube · POST /api/tutorials/expand-prompt · POST /api/tutorials/suggest-highlights · POST /api/tutorials/suggest-markup-flags · POST /api/tutorials/extract-knowledge · POST /api/tutorials/generate (SSE)');
  console.log('Ask AI: POST /api/ask');
  console.log('Assistant: POST /api/assistant/turn (SSE)');
  console.log('Sources stub: GET/POST /api/sources · GET /api/collections\n');
});
