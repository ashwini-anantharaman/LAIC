-- Slice 6 — Learning seam (Nexus v0.4 §7).
--
-- Courses and progress must be isolated the same way as every other tenant row:
-- scoped by organization (and program) and guarded by the same org-scoped RLS.
-- Content internals live in the Learning Platform (OWLWISE); this migration owns
-- the scoping + policies so a course/enrollment can never leak across orgs.
--
-- Idempotent.

-- ── Scoping columns ─────────────────────────────────────────────────────────
alter table courses add column if not exists program_id uuid references programs(id) on delete set null;
create index if not exists courses_program_id_idx on courses(program_id);

alter table enrollments add column if not exists org_id uuid references organizations(id) on delete cascade;
alter table enrollments add column if not exists program_id uuid references programs(id) on delete set null;
create index if not exists enrollments_org_id_idx on enrollments(org_id);

-- ── RLS: courses are org-scoped ─────────────────────────────────────────────
alter table courses enable row level security;
drop policy if exists nexus_org_scope on courses;
create policy nexus_org_scope on courses
  for all using (nexus_is_org_member(org_id)) with check (nexus_is_org_member(org_id));

-- ── RLS: enrollments follow their course's org (fallback when org_id unset) ──
alter table enrollments enable row level security;
drop policy if exists nexus_org_scope on enrollments;
create policy nexus_org_scope on enrollments
  for all using (
    nexus_is_org_member(coalesce(org_id, (select c.org_id from courses c where c.id = enrollments.course_id)))
  ) with check (
    nexus_is_org_member(coalesce(org_id, (select c.org_id from courses c where c.id = enrollments.course_id)))
  );

-- nexus_app already holds table privileges (granted "on all tables in schema
-- public" in 0007); the new columns inherit them.
