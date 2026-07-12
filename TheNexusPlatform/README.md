# Life in AI Center

A mobile-first, AI-enabled learning platform. Students learn any concept in three
switchable explanation modes, and educators build & manage courses — all in one
unified mobile interface.

## Learning modes

The same concept is regenerated in a different voice; the UI adapts per mode:

- **Conversational** (owl) — a tutor talking you through it, message by message.
- **Summary** — a clear, textbook-style explanation.
- **Real-world (Narrative)** — analogies and everyday examples.

Modes the instructor didn't generate appear grayed out; a separate indicator shows
whether an interactive animation/simulation exists for the module. The default mode
comes from the student's onboarding preference.

## Structure

- `src/app/App.tsx` — root navigation + splash (role select), student login,
  onboarding, and courses.
- `src/app/Unit.tsx` — the lesson view and the mode switcher.
- `src/app/Teacher.tsx` — full educator flow: login, onboarding, upload materials,
  unit builder, and the teacher app (Lessons, Students, Challenge, Settings).
- `src/app/shared.tsx` — shared mobile UI primitives (Shell, StatusBar, ObShell, OwlAnim).
- `src/services/` — a typed, mock-backed service layer (`auth`, `courses`,
  `content`, `teacher`) with per-mode prompt templates. Swap the mock
  implementations for HTTP clients against the FastAPI/Supabase backend with no UI
  changes.

## Running

```
npm install
npm run dev
```

Then open http://localhost:5173/.

### Backend (local)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add ANTHROPIC_API_KEY, Supabase keys
uvicorn app.main:app --port 8000 --reload
```

### Platform admin UI (local)

```bash
cd platform_logic
npm install
cp .env.example .env
npm run dev
```

Open http://localhost:5180/ (or the port Vite prints).

## Deploying to Vercel

This repo supports **two frontends + one API**:

| App | Vercel setup | API URL |
|-----|----------------|---------|
| **Student app + API** | One project, repo root, uses root `vercel.json` | Same domain — `/api` rewrites to FastAPI |
| **Platform admin** | Second project, root directory `platform_logic` | Set `VITE_API_URL` to student deployment URL |

### 1. Student app + backend (single Vercel project)

1. Import the GitHub repo in [Vercel](https://vercel.com/new).
2. Leave **Root Directory** empty (repo root).
3. Vercel reads `vercel.json` — builds the Vite student app and deploys FastAPI from `backend/`.
4. **Environment variables** (Project → Settings → Environment Variables):

   | Variable | Example | Notes |
   |----------|---------|--------|
   | `ANTHROPIC_API_KEY` | `sk-ant-...` | Required for course generation |
   | `SUPABASE_URL` | `https://xxx.supabase.co` | Required for auth/data |
   | `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | Server-side only |
   | `FRONTEND_ORIGIN` | `https://your-app.vercel.app` | Your production URL |
   | `EXTRA_CORS_ORIGINS` | `https://your-platform.vercel.app` | Platform admin URL (optional; `*.vercel.app` already allowed) |

5. **Do not set** `VITE_API_URL` on this project — the student app uses same-origin `/api` in production.

6. Deploy. Test: `https://your-app.vercel.app/health` → `{"ok":true,...}`

### 2. Platform admin (second Vercel project)

1. Create **another** Vercel project from the same repo.
2. Set **Root Directory** to `platform_logic`.
3. Set environment variable:

   | Variable | Value |
   |----------|--------|
   | `VITE_API_URL` | `https://your-student-app.vercel.app` (no trailing slash) |

4. Deploy. The platform UI calls the API on your student deployment.

### Notes

- **Join codes** only work when students and teachers use the **same API** (same student Vercel URL or same local backend).
- Long-running course generation may hit **serverless timeouts** on Vercel; for heavy PDF ingest, consider hosting the backend on Railway, Fly.io, or Render instead and pointing both frontends at that URL via `VITE_API_URL`.
- Run Supabase migrations before production: `backend/supabase/schema.sql` and `migration_platform.sql`.
