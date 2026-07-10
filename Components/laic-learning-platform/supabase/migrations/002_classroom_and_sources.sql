-- Classroom join codes, stored source files, and page/time-aware chunks

alter table courses add column if not exists join_code text unique;

-- Original URL for Video / Article / Drive / Quizlet sources (used for embeds)
alter table sources add column if not exists url text;

-- Where each chunk came from inside its source:
--   page_start/page_end  → PDF page range
--   time_start/time_end  → transcript seconds range (video / audio)
alter table document_chunks
  add column if not exists page_start int,
  add column if not exists page_end int,
  add column if not exists time_start int,
  add column if not exists time_end int;

-- match_chunks now also returns provenance so lessons can cite pages,
-- link video clips, and open the PDF at the right page.
drop function if exists match_chunks(vector(1024), uuid, int);

create or replace function match_chunks(
  query_embedding vector(1024),
  match_course_id uuid,
  match_count int default 6
)
returns table (
  id uuid,
  source_id uuid,
  content text,
  citation text,
  page_start int,
  page_end int,
  time_start int,
  time_end int,
  similarity float
)
language sql stable
as $$
  select
    dc.id,
    dc.source_id,
    dc.content,
    dc.citation,
    dc.page_start,
    dc.page_end,
    dc.time_start,
    dc.time_end,
    1 - (dc.embedding <=> query_embedding) as similarity
  from document_chunks dc
  where dc.course_id = match_course_id
    and dc.embedding is not null
  order by dc.embedding <=> query_embedding
  limit match_count;
$$;

-- Private bucket for original uploaded source files (PDF reference panel)
insert into storage.buckets (id, name, public)
values ('sources', 'sources', false)
on conflict (id) do nothing;
