-- A CLUB can be the subject of a content grant, not just a person or a role.
--
-- 0007 introduced learning_object_grants to answer "who else may see this
-- object", with subject_type in ('profile', 'role') — the personal tier, where
-- an author shares their own work with a colleague or a group. A content
-- manager asks the same question about a different kind of subject: which
-- CLUBS may see this. Same question, same answer shape, so the same table.
--
-- The alternative was a second table keyed on club_program_id. Two tables would
-- have meant two visibility predicates that must agree forever — and they would
-- have had to be edited together every time the rules moved. One table, three
-- subject types, one place to look.
--
-- WHY THE ARM LIVES IN _programScope, NOT _personalScope. The personal tier only
-- consults grants for rows marked scope_level = 'user'; a program-scoped object
-- is already visible to everyone in program scope. But a club grant exists
-- precisely to reach ACROSS programs — club B's object, program-scoped, made
-- visible to club A — so it has to widen the program predicate itself. Two arms
-- on the same table, deliberately, because they answer different questions:
-- which programs' content is in scope, and whose.
--
-- subject_id stays `text` and carries the club's program uuid as a string. The
-- column is shared with profile and role ids, so it cannot be typed narrower,
-- and a club is a partner PROGRAM (programs.metadata_json.is_partner) whose id
-- is validated in the API against listPartnersForProgram before a row is written.
--
-- ADDITIVE, DELIBERATELY. A grant only ever WIDENS an audience — the arm sits
-- beside the program and NULL arms rather than replacing them. The alternative
-- ("once an object has any explicit share, only the listed clubs see it", which
-- is how a file-sharing UI usually behaves) means the FIRST share on an object
-- silently revokes it from every club reading it today. That is a data-loss-
-- shaped surprise triggered by a gesture that reads as generous.
--
-- Replayed on every `npm run migrate` (see ../README.md) — the runner has no
-- ledger, so this file is end-state and idempotent, never drop-and-rebuild.

-- 0007 wrote the constraint as ('profile', 'role'), and `create table if not
-- exists` will not revisit it on a database where that table already stands —
-- so widening has to be an explicit ALTER here rather than an edit up there.
-- Found by DEFINITION, not by name: 0007 declared the check inline, so its name
-- is whatever Postgres generated, and hard-coding a guess would silently no-op on
-- any database that named it differently — leaving the old constraint in place and
-- every club insert failing. Drop whatever check on this table mentions
-- subject_type, then add ours under a name we control.
do $$
declare
  c text;
begin
  if to_regclass('public.learning_object_grants') is null then
    return; -- 0007 has not run yet; it will create the table, then this replays
  end if;

  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'learning_object_grants'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%subject_type%'
      and con.conname <> 'learning_object_grants_subject_type_chk'
  loop
    execute format('alter table learning_object_grants drop constraint %I', c);
  end loop;

  if not exists (
    select 1 from pg_constraint where conname = 'learning_object_grants_subject_type_chk'
  ) then
    alter table learning_object_grants
      add constraint learning_object_grants_subject_type_chk
      check (subject_type in ('profile', 'role', 'club'));
  end if;
end $$;

comment on column learning_object_grants.subject_type is
  'profile = a person, role = everyone holding it, club = a partner program (0008). The club arm widens _programScope; the other two widen _personalScope.';

-- The club read is its own access pattern: "which objects reach this club?" runs
-- as the third arm of _programScope on every library listing for a club member,
-- and the existing (subject_type, subject_id) index already serves it. This
-- partial index keeps the club rows tight for the picker's reverse question —
-- "which clubs is this object shared with?" — without competing with the
-- personal tier's lookups on the same table.
create index if not exists idx_learning_object_grants_club
  on learning_object_grants (object_id)
  where subject_type = 'club';
