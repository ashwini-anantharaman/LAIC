-- Run this in the Supabase SQL editor if you already applied the original schema.sql.
-- Safe to run on a fresh database too (uses IF NOT EXISTS / IF NOT EXISTS columns).

alter table courses add column if not exists join_code text unique;
alter table courses add column if not exists grade text;
alter table courses add column if not exists goals text;

alter table uploads add column if not exists course_id uuid references courses(id) on delete cascade;
alter table uploads alter column kind set default 'context';

create table if not exists enrollments (
  id           uuid primary key default uuid_generate_v4(),
  course_id    uuid not null references courses(id) on delete cascade,
  display_name text not null default 'Student',
  joined_at    timestamptz not null default now()
);

create index if not exists uploads_course_id_idx on uploads(course_id);
create index if not exists enrollments_course_id_idx on enrollments(course_id);
create index if not exists courses_join_code_idx on courses(join_code);
