-- 0006: Phase 13 de-governance (execution plan deviation 6, 2026-07-09).
-- Approval/publication gates removed: item and package statuses collapse to
-- active | deprecated. Columns approved_by/approved_at/published_by/
-- published_at are retired (kept in place, written NULL) so this migration
-- is data-only and reversible by restoring from item revisions.

update bridge_readable_knowledge_items
  set status = 'active'
  where status in ('draft', 'needs_review', 'approved');

update bridge_readable_knowledge_items
  set approved_by = null, approved_at = null;

update bridge_published_packages
  set status = 'active', published_by = null, published_at = null
  where status in ('draft', 'review', 'published');

update bridge_generated_artifacts
  set status = 'active'
  where status in ('draft', 'review', 'published');
