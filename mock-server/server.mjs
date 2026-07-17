// Throwaway stub for the Course Wizard — Step 1 (Sources) ONLY.
// Dependency-free Node HTTP server. Run: `node mock-server/server.mjs`
// It fakes ingestion: new / reingested / seeded-"processing" sources flip to
// "ready" after a few seconds so you can watch the poll update the chip and the
// "Design structure →" gate unlock. NOT for production — no real files/embeddings.

import { createServer } from 'node:http';

const PORT = process.env.PORT ? Number(process.env.PORT) : 8000;
const READY_AFTER_MS = 6000; // how long a source stays "processing"

/** @type {Array<Record<string, any>>} */
let sources = [
  {
    id: 'src-1', title: 'How to Play Bridge', filename: 'how-to-play-bridge.pdf',
    kind: 'pdf', pages: 6, domain: 'ACBL Bridge Guide',
    primary: true, ingestionStatus: 'ready', collectionId: 'col-1',
  },
  {
    id: 'src-2', title: 'Bridge Basics — Video Transcript', filename: 'bridge-basics.vtt',
    kind: 'video-transcript', duration: '5 min', domain: 'Bridge Education Network',
    primary: false, ingestionStatus: 'processing',
  },
  {
    id: 'src-3', title: 'Scanned Rulebook (legacy)', filename: 'rulebook-scan.pdf',
    kind: 'pdf', pages: 42, domain: 'Legacy import',
    primary: false, ingestionStatus: 'failed',
    ingestionError: 'Text extraction failed — the file appears to be image-only.',
  },
];

const collections = [
  { id: 'col-1', name: 'Bridge core', sourceIds: ['src-1'] },
];

/** Flip a source to "ready" after a delay to simulate embedding. */
function scheduleReady(id) {
  setTimeout(() => {
    const s = sources.find((x) => x.id === id);
    if (s && s.ingestionStatus === 'processing') {
      s.ingestionStatus = 'ready';
      delete s.ingestionError;
      console.log(`  ↳ ${id} embedded (ready)`);
    }
  }, READY_AFTER_MS);
}

// Kick off the seeded "processing" source.
sources.filter((s) => s.ingestionStatus === 'processing').forEach((s) => scheduleReady(s.id));

let seq = 100;
const nextId = () => `src-${++seq}`;

function send(res, status, body) {
  const json = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

const server = createServer(async (req, res) => {
  const { method } = req;
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  if (method === 'OPTIONS') return send(res, 204);
  console.log(`${method} ${path}`);

  // GET /api/sources
  if (method === 'GET' && path === '/api/sources') return send(res, 200, sources);

  // GET /api/collections
  if (method === 'GET' && path === '/api/collections') return send(res, 200, collections);

  // GET /api/sources/:id  (poll target)
  const getOne = path.match(/^\/api\/sources\/([^/]+)$/);
  if (method === 'GET' && getOne) {
    const s = sources.find((x) => x.id === decodeURIComponent(getOne[1]));
    return s ? send(res, 200, s) : send(res, 404, { code: 'not_found', message: 'Source not found' });
  }

  // POST /api/sources  (multipart file OR JSON { name })
  if (method === 'POST' && path === '/api/sources') {
    const raw = await readBody(req);
    const ct = req.headers['content-type'] || '';
    let title = 'Untitled source';
    let filename = 'untitled.txt';
    let kind = 'text';

    if (ct.includes('application/json')) {
      try {
        const body = JSON.parse(raw.toString() || '{}');
        if (body.name) { title = body.name; filename = `${body.name}`; }
      } catch { /* ignore */ }
    } else if (ct.includes('multipart/form-data')) {
      const m = raw.toString('latin1').match(/filename="([^"]+)"/);
      if (m && m[1]) {
        filename = m[1];
        title = filename.replace(/\.[^.]+$/, '');
        const ext = (filename.split('.').pop() || '').toLowerCase();
        kind = ext === 'pdf' ? 'pdf'
          : ext === 'doc' || ext === 'docx' ? 'docx'
          : ext === 'ppt' || ext === 'pptx' ? 'slides'
          : 'text';
      }
    }

    const created = {
      id: nextId(), title, filename, kind, domain: 'Uploaded',
      primary: false, ingestionStatus: 'processing',
    };
    sources = [created, ...sources];
    scheduleReady(created.id);
    return send(res, 201, created);
  }

  // POST /api/sources/:id/reingest
  const reingest = path.match(/^\/api\/sources\/([^/]+)\/reingest$/);
  if (method === 'POST' && reingest) {
    const s = sources.find((x) => x.id === decodeURIComponent(reingest[1]));
    if (!s) return send(res, 404, { code: 'not_found', message: 'Source not found' });
    s.ingestionStatus = 'processing';
    delete s.ingestionError;
    scheduleReady(s.id);
    return send(res, 200, s);
  }

  return send(res, 404, { code: 'not_found', message: `No stub route for ${method} ${path}` });
});

server.listen(PORT, () => {
  console.log(`\nLAIC Step-1 stub API → http://localhost:${PORT}`);
  console.log(`Sources: 1 ready · 1 processing (→ready in ${READY_AFTER_MS / 1000}s) · 1 failed`);
  console.log('Endpoints: GET /api/sources · GET /api/collections · GET /api/sources/:id · POST /api/sources · POST /api/sources/:id/reingest\n');
});
