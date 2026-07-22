-- Students are members too (the student funnel: approval = access).
-- grantStudentAccess turns an approved registrant into a real student by
-- creating a program-scoped membership with role 'learner' — the thing
-- resolvePlatformAccess actually checks. The role vocabulary from
-- 0004_nexus_addendum ('owner', 'administrator', 'instructor') predates
-- students-as-members; this adds 'learner'. Learner memberships always carry
-- view access and a program_id.
alter table org_memberships drop constraint if exists org_memberships_role_check;
alter table org_memberships add constraint org_memberships_role_check
  check (role in ('owner', 'administrator', 'instructor', 'learner'));
