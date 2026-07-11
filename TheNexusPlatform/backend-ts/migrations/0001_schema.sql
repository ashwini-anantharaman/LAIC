-- Life in AI Center — app schema (run in the Supabase SQL editor).
-- This is additive: it does NOT touch the older LIAC wedge tables
-- (sources / concepts / simulations).

create extension if not exists "uuid-ossp";

-- User profiles (student or teacher). Mirrors the architecture doc's "learners"
-- table intent; kept minimal for v1.
create table if not exists profiles (
  id          uuid primary key default uuid_generate_v4(),
  email       text unique not null,
  role        text not null default 'student' check (role in ('student', 'teacher')),
  name        text,
  grade       text,
  created_at  timestamptz not null default now()
);

-- Courses created/joined in the app.
create table if not exists courses (
  id          uuid primary key default uuid_generate_v4(),
  subject     text not null,
  unit_title  text not null,
  teacher     text,
  units       int not null default 1,
  join_code   text unique,
  grade       text,
  goals       text,
  created_at  timestamptz not null default now()
);

-- Units within a course.
create table if not exists units (
  id           uuid primary key default uuid_generate_v4(),
  course_id    uuid references courses(id) on delete cascade,
  module_label text not null default 'Module 1',
  concept      text not null,
  position     int not null default 0,
  created_at   timestamptz not null default now()
);

-- Cache of AI-generated unit content (all three modes in one JSON blob).
-- Keyed by (unit_id, topic, grade) so re-opening a lesson is instant.
create table if not exists unit_content (
  id          uuid primary key default uuid_generate_v4(),
  unit_id     text not null,
  topic       text not null,
  grade       text not null default '',
  content     jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (unit_id, topic, grade)
);

-- Teacher-uploaded source materials (for the future generate pipeline).
create table if not exists uploads (
  id             uuid primary key default uuid_generate_v4(),
  course_id      uuid references courses(id) on delete cascade,
  filename       text not null,
  kind           text not null default 'context',  -- 'context' | 'embedding'
  extracted_text text,
  created_at     timestamptz not null default now()
);

-- Test enrollments (no auth in v1).
create table if not exists enrollments (
  id           uuid primary key default uuid_generate_v4(),
  course_id    uuid not null references courses(id) on delete cascade,
  display_name text not null default 'Student',
  joined_at    timestamptz not null default now()
);

create index if not exists uploads_course_id_idx on uploads(course_id);
create index if not exists enrollments_course_id_idx on enrollments(course_id);
create index if not exists courses_join_code_idx on courses(join_code);

create index if not exists units_course_id_idx on units(course_id);
create index if not exists unit_content_lookup_idx on unit_content(unit_id, topic, grade);

-- Screen-by-screen module structures (chapter learning path).
create table if not exists module_structures (
  id          uuid primary key default uuid_generate_v4(),
  unit_id     text not null unique,
  structure   jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Bayesian mastery per student per assessment item.
create table if not exists item_mastery (
  id           uuid primary key default uuid_generate_v4(),
  student_id   text not null default 'local-student',
  unit_id      text not null,
  item_id      text not null,
  alpha        float not null default 1,
  beta         float not null default 1,
  wrong_count  int not null default 0,
  last_result  text,
  updated_at   timestamptz not null default now(),
  unique (student_id, unit_id, item_id)
);

create index if not exists module_structures_unit_idx on module_structures(unit_id);
create index if not exists item_mastery_lookup_idx on item_mastery(student_id, unit_id);
