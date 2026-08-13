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

-- NO BACKFILL HERE, deliberately.
--
-- Which club owns the challenges that already exist is a human decision — there is
-- nothing on those rows to derive it from (no program, and invites can span clubs) —
-- and a schema change should not wait on it. Leaving them NULL is safe: NULL reads as
-- unscoped, so they keep behaving exactly as they do today, visible to whoever was
-- invited, while everything created from now on is scoped to its club.
--
-- Attribute them whenever you like, with this (see db/README or the plan):
--
--   update bridge_challenges
--      set nexus_program_id = '<club program id>', scope_level = 'program'
--    where nexus_program_id is null;
--
-- Resolving the club by name was the alternative and was rejected: this tree's
-- migrations must apply to a bridge-only database, and `programs` is a Nexus table.

-- The read path: a club's challenges, newest first — matching how the summary and
-- the "latest challenge" resolver already order them.
create index if not exists idx_bch_scope
  on bridge_challenges (nexus_program_id, created_at desc);
