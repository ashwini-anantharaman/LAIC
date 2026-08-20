-- Students are members too (the student funnel: approval = access).
-- grantStudentAccess turns an approved registrant into a real student by
-- creating a program-scoped membership with role 'learner' — the thing
-- resolvePlatformAccess actually checks. The role vocabulary from
-- 0004_nexus_addendum ('owner', 'administrator', 'instructor') predates
-- students-as-members; this adds 'learner'. Learner memberships always carry
-- view access and a program_id.
--
-- 'member' IS IN THIS LIST BECAUSE 0026 ADDED IT. This file was written against
-- 0004's vocabulary and re-stated it verbatim plus 'learner', which silently
-- DROPPED the 'member' role 0026_scoped_roles had introduced one file earlier.
-- The runner replays every file on every migrate, so 0026 widened the check and
-- 0027 immediately narrowed it again — and with real 'member' rows in the table
-- the ALTER could not validate, aborting the whole run. Every migration after
-- this point, core and platform packs alike, therefore never applied.
--
-- The lesson is in the shape, not the typo: a check constraint restated from an
-- older file is a narrowing waiting to happen. Anything editing this constraint
-- again must state the UNION of every role in use, not the list it remembers.
alter table org_memberships drop constraint if exists org_memberships_role_check;
alter table org_memberships add constraint org_memberships_role_check
  check (role in ('owner', 'administrator', 'instructor', 'member', 'learner'));
