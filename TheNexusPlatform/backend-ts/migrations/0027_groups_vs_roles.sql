-- Groups vs Roles (Discord-style).
--   * Roles carry permissions; a role may optionally "display as its own group"
--     (program_roles.display_as_group). When on, holding the role also places
--     the person in a same-named group; when off, the role never surfaces as a
--     group and people are placed into explicit groups instead.
--   * Group placement is email-keyed (group_memberships.email), matching the
--     People tab's email-keyed model, so a person can be placed in a group when
--     invited — before they have a user account. (user_id was already nullable.)
-- Idempotent: replayed on every boot.

ALTER TABLE program_roles ADD COLUMN IF NOT EXISTS display_as_group boolean NOT NULL DEFAULT false;

ALTER TABLE group_memberships ADD COLUMN IF NOT EXISTS email text;

-- One placement row per (group, person). Partial unique indexes keep the
-- email-keyed and user-keyed placements each de-duplicated without colliding.
CREATE UNIQUE INDEX IF NOT EXISTS group_memberships_group_email_uniq
  ON group_memberships (group_id, lower(email)) WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS group_memberships_email_idx
  ON group_memberships (lower(email)) WHERE email IS NOT NULL;
