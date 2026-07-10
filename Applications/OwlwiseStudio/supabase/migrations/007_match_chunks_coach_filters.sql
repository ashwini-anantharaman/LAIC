-- M4 · Workstream A (LR1/LR6): extend match_chunks so the external Coach can
-- retrieve source-bound chunks for a scoped query — filter by concept/skill
-- tags, chunk_type, and allowed/forbidden ids, and return the tag columns the
-- Coach's KnowledgeChunk contract needs (concept_ids, skill_ids, chunk_type).
--
-- Additive + backward compatible: the new filter params all default to null, so
-- existing callers (retrieveChunks → match_chunks(embedding, course, count))
-- keep working; the extra returned columns are simply ignored by name-based rpc
-- consumers.

drop function if exists match_chunks(vector(1024), uuid, int);

create or replace function match_chunks(
  query_embedding vector(1024),
  match_course_id uuid,
  match_count int default 6,
  filter_chunk_type text default null,
  filter_concept_ids text[] default null,
  filter_skill_ids text[] default null,
  filter_source_ids uuid[] default null,
  forbid_concept_ids text[] default null
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
  concept_ids text[],
  skill_ids text[],
  chunk_type text,
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
    dc.concept_ids,
    dc.skill_ids,
    dc.chunk_type,
    1 - (dc.embedding <=> query_embedding) as similarity
  from document_chunks dc
  where dc.course_id = match_course_id
    and dc.embedding is not null
    and (filter_chunk_type is null or dc.chunk_type = filter_chunk_type)
    and (filter_concept_ids is null or dc.concept_ids && filter_concept_ids)
    and (filter_skill_ids   is null or dc.skill_ids   && filter_skill_ids)
    and (filter_source_ids  is null or dc.source_id = any(filter_source_ids))
    and (forbid_concept_ids is null or not (dc.concept_ids && forbid_concept_ids))
  order by dc.embedding <=> query_embedding
  limit match_count;
$$;
