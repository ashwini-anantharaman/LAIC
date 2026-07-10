-- LAIC platform schema
create extension if not exists vector;

-- Profiles (extends Supabase Auth)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('student', 'instructor')),
  display_name text not null,
  email text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists instructor_profiles (
  user_id uuid primary key references profiles(id) on delete cascade,
  template text,
  preferences jsonb not null default '{"autoGenerateModes":true,"suggestPrereqGraph":true,"recommendVideos":true,"flagStrugglingStudents":false}'::jsonb,
  default_modes jsonb not null default '{"real-world":true,"conversational":true,"textbook":true}'::jsonb,
  onboarding_complete boolean not null default false
);

create table if not exists learner_models (
  user_id uuid primary key references profiles(id) on delete cascade,
  age text,
  goal text,
  default_mode text not null default 'conversational',
  session_length text,
  streak int not null default 0,
  onboarding_complete boolean not null default false
);

create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  subject text,
  published boolean not null default false,
  default_modes jsonb not null default '{"real-world":true,"conversational":true,"textbook":true}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists chapters (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  title text not null,
  label text not null,
  sort_order int not null default 0
);

create table if not exists concepts (
  id text not null,
  course_id uuid not null references courses(id) on delete cascade,
  chapter_id uuid not null references chapters(id) on delete cascade,
  name text not null,
  subtitle text,
  letter text,
  sort_order int not null default 0,
  primary key (course_id, id)
);

create table if not exists modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  chapter_id uuid references chapters(id) on delete set null,
  concept_id text,
  name text not null,
  sort_order int not null default 0
);

create table if not exists prerequisite_edges (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  from_name text not null,
  to_name text not null
);

create table if not exists content_blocks (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references modules(id) on delete cascade,
  type text not null,
  label text,
  title text,
  content jsonb not null default '{}'::jsonb,
  sort_order int not null default 0
);

create table if not exists concept_mode_availability (
  course_id uuid not null references courses(id) on delete cascade,
  concept_id text not null,
  modes text[] not null default '{}',
  has_interactive boolean not null default false,
  primary key (course_id, concept_id)
);

create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  name text not null,
  type text not null,
  status text not null default 'indexing',
  detail text,
  storage_path text,
  created_at timestamptz not null default now()
);

create table if not exists document_chunks (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  source_id uuid not null references sources(id) on delete cascade,
  content text not null,
  citation text,
  embedding vector(1024),
  chunk_index int not null default 0
);

create index if not exists document_chunks_embedding_idx
  on document_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create table if not exists mastery_states (
  user_id uuid not null references profiles(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  concept_id text not null,
  level text not null default 'not-seen',
  bkt_score numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, course_id, concept_id)
);

create table if not exists reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  concept_id text not null,
  answers text[] not null,
  is_session boolean not null default false,
  embedding vector(1024),
  created_at timestamptz not null default now()
);

create table if not exists misconceptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  concept_id text not null,
  question_id text not null,
  wrong_answer text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists mode_switch_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  concept_id text not null,
  from_mode text not null,
  to_mode text not null,
  created_at timestamptz not null default now()
);

create table if not exists enrollments (
  user_id uuid not null references profiles(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  primary key (user_id, course_id)
);

create or replace function match_chunks(
  query_embedding vector(1024),
  match_course_id uuid,
  match_count int default 6
)
returns table (
  id uuid,
  content text,
  citation text,
  similarity float
)
language sql stable
as $$
  select
    dc.id,
    dc.content,
    dc.citation,
    1 - (dc.embedding <=> query_embedding) as similarity
  from document_chunks dc
  where dc.course_id = match_course_id
    and dc.embedding is not null
  order by dc.embedding <=> query_embedding
  limit match_count;
$$;

-- RLS (service role bypasses; anon uses policies where needed)
alter table profiles enable row level security;
alter table mastery_states enable row level security;

create policy "Users read own profile" on profiles for select using (auth.uid() = id);
create policy "Users read own mastery" on mastery_states for select using (auth.uid() = user_id);
