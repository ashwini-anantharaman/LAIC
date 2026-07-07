# The Nexus Platform

Self-contained home for the **Nexus Platform** (organization / coach / learner
management), separate from the Life-in-AI mobile student app. Everything the
platform needs lives in this folder.

```
TheNexusPlatform/
├── frontend/   # Platform admin UI (Vite + React): landing → login/signup →
│               # org setup → dashboard, plus the persona prototype
│               # (Organization / Coach / Learner). See src/main.tsx.
└── backend/    # Platform API (FastAPI): auth, orgs, stages, join codes,
                # dashboard. Backed by Supabase. Mobile-app routers
                # (content/courses/learning/uploads) were removed.
```

## Run locally (two terminals)

### 1. Backend (FastAPI + Supabase)

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
# .env already contains SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
uvicorn app.main:app --port 8000 --reload
```

Health check: http://localhost:8000/health → `{"ok":true,...,"supabase":true}`

**Database migrations** (run once against Supabase). Get the connection string
from Supabase → Connect → Session pooler (IPv4):

```powershell
$env:DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
python scripts/run_platform_migrations.py
```

### 2. Frontend (platform admin UI)

```powershell
cd frontend
npm install
npm run dev
```

`frontend/.env` sets `VITE_API_URL=http://localhost:8000`. Open the URL Vite prints.

## Notes

- The backend uses `truststore` so TLS to Supabase works on networks that
  intercept HTTPS (school proxies / AV SSL scanning). Harmless on normal hosts.
- The persona prototype (Organization / Coach / Learner) uses mock data and
  needs no backend; it's reached from the dashboard via "Open Platform".
- **Secrets:** `backend/.env` holds the Supabase service-role key — never commit
  it or expose it to the frontend.
