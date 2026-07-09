# LAIC AI Learning Platform

Complete implementation of the LAIC platform per the **LAIC Full Platform Spec (V5 Final)** — indigo/purple Figma UI, instructor and student workflows, six AI agents, Bayesian Knowledge Tracing, and three explanation modes.

## Stack

- **Frontend:** React 18 + Vite + Tailwind CSS + shadcn/ui primitives
- **Backend:** Express API (`server/`) with Supabase Auth, PostgreSQL + pgvector, Storage
- **AI:** Claude (content + agents), OpenAI/Voyage embeddings, Whisper transcription
- **Animations:** GSAP, Three.js, D3

## Quick start

```bash
cp .env.example .env   # add Supabase + API keys
npm install
npm run dev            # Vite :5173 + API :3001
```

Apply the database schema:

```bash
# Run supabase/migrations/001_initial.sql, then 002_classroom_and_sources.sql
# in your Supabase project (002 adds join codes, stored source files, and
# page/time-aware chunks — required for classroom joining and the PDF panel)
npm run seed           # optional Brain Bee demo course
```

## Spec coverage

| Area | Status |
|------|--------|
| Landing (Start Learning / Educator + mascot) | ✅ |
| Supabase auth + role-based login | ✅ |
| Instructor onboarding (category, age, style) | ✅ |
| Student onboarding (5 questions) | ✅ |
| Upload materials + RAG ingestion | ✅ |
| Unit outline + block generation | ✅ |
| Three explanation modes (Real World, Conversational, Textbook) | ✅ |
| Integrated lesson flow (hook → content → flashcards → quiz → reflection) | ✅ |
| AI Assistant sidebar (guardrailed) | ✅ |
| BKT mastery tracking | ✅ |
| Six agents (orchestrator, tutor, quiz, reflection, planner, assistant) | ✅ |
| Instructor dashboard analytics | ✅ |
| Challenge Details, Tools, Settings screens | ✅ |
| GSAP / 3D animation pipeline | ✅ |
| Classroom join codes + links (real enrollment) | ✅ |
| One-shot “Generate all modules” | ✅ |
| Source PDFs stored + page-cited chunks + student PDF panel | ✅ |
| Audio (Whisper), Quizlet, Drive, timestamped YouTube ingestion | ✅ |
| Auto-matched video clips + fixed module tests | ✅ |

## Project structure

```
src/screens/          # All UI screens (Figma-matched)
src/components/laic/  # LAIC design system shell
server/agents/        # Six AI agents
server/routes/        # API routes
supabase/migrations/  # PostgreSQL schema
```

## Design

UI tokens live in `src/constants/figmaTheme.ts` (Figma file `Ly10cD7OoMrWTngAnN2nYO`). The Navi mascot animates on the landing page; explanation mode switcher uses 🌍 💡 📖 icons per spec.
