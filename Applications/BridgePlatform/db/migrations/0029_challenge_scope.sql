-- 0029: a challenge belongs to a club.
--
-- Challenges were the outlier. bridge_library_collections (0026) and
-- bridge_assignment_briefs (0028) already carry program_organization_id +
-- nexus_program_id, and 0025 gave the kb tables the same partition — but
-- bridge_challenges (0027) has no scope column at all, so visibility rests
-- entirely on invites (bridge_challenge_invites, "platform-wide (cross-org)").
--
-- That is a leak once one person belongs to two clubs. A partner-club member's
-- nexusUserId is their ORG-scoped profile id (platformAccess.ts resolves it from
-- _orgMembership, which matches on org_id alone), so two clubs in one org see the
-- same identity — and therefore the same merged challenge list. Someone in a
-- single club was never affected: they were simply not invited to the other's.
--
-- NULL means UNSCOPED — visible to anyone invited, wherever they are. That is
-- the cross-org door the spec's "platform-wide invites" wanted, kept open at no
-- cost. The read path treats NULL as a wildcard, so the write path must never
-- produce one by accident: both create paths refuse rather than store a null
-- owner when they cannot resolve a program.
--
-- scope_level is written and deliberately NOT READ in this version. It exists so
-- the "user" level (library-core's ScopeLevel = "user" | "program" | "org") needs
-- no migration when individually-owned content arrives.

alter table bridge_challenges add column if not exists nexus_program_id text;
alter table bridge_challenges add column if not exists program_organization_id text;
alter table bridge_challenges add column if not exists scope_level text;

-- Backfill: every challenge created before this migration is attributed to ONE
-- club, by owner direction. There is nothing on the old rows to infer a club
-- from — no program, and invites can span clubs — so this is a decision, not a
-- derivation, and it is recorded here rather than run by hand so the ledger keeps
-- it to exactly one execution.
--
-- The guard is deliberate: the column is text, so an unreplaced placeholder would
-- otherwise be stored happily and attribute every challenge to a club that does
-- not exist. Failing loudly is the cheaper mistake, and apply.mjs runs each
-- migration in one transaction, so a raise leaves nothing behind.
do $$
declare
  club_program_id text := 'REPLACE_WITH_CLUB_PROGRAM_ID';
begin
  if club_program_id = 'REPLACE_WITH_CLUB_PROGRAM_ID' then
    raise exception
      '0029 needs the club program id for the backfill. Replace the placeholder in this migration first.';
  end if;

  update bridge_challenges
     set nexus_program_id = club_program_id,
         scope_level = 'program'
   where nexus_program_id is null;
end $$;

-- The read path: a club's challenges, newest first — matching how the summary and
-- the "latest challenge" resolver already order them.
create index if not exists idx_bch_scope
  on bridge_challenges (nexus_program_id, created_at desc);
