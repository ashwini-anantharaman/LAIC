-- Gates can offer MULTIPLE roles at sign-up; the signer picks one. Supersedes
-- the single role_id (kept for backward compat + as the effective fallback).
alter table gates add column if not exists role_ids jsonb not null default '[]'::jsonb;

-- Backfill: an existing member gate's single role becomes a one-element list.
update gates
   set role_ids = jsonb_build_array(role_id)
 where role_id is not null
   and (role_ids is null or role_ids = '[]'::jsonb);
