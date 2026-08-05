-- 0029: Roles can live in the group hierarchy, and groups gain a NEXUS altitude.
--
-- Two additive, idempotent changes (safe to re-run):
--   1. program_roles.parent_group_id — a role may sit under a parent group (or
--      none), so the People → "Roles & Groups" tree can nest roles beside groups.
--   2. groups / group_memberships org_id nullable — org_id null = a NEXUS
--      (platform) group, mirroring how program_roles already allows org_id null
--      for nexus-level roles. program_id null (as today) = org-level.

-- Roles join the hierarchy. ON DELETE SET NULL: dropping a parent group just
-- detaches the role (same behaviour groups already have among themselves).
ALTER TABLE program_roles
  ADD COLUMN IF NOT EXISTS parent_group_id uuid REFERENCES groups(id) ON DELETE SET NULL;

-- Nexus-level groups: allow org_id null on the group and its memberships.
ALTER TABLE groups ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE group_memberships ALTER COLUMN organization_id DROP NOT NULL;

-- Nexus-group placements are email-keyed like everything else; the existing
-- (group_id, lower(email)) unique index already covers them.
