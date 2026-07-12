-- Two-sided consent for organization relationships (like a friend request).
--
-- Org A proposes a relationship to Org B (status 'proposed' = pending). Org B
-- must ACCEPT (status → 'active'), and either side may REMOVE it (delete), which
-- removes it for both. The original single policy allowed either side to read
-- but only the source org to write, so the target could neither accept nor
-- remove. Split into per-command policies.

alter table organization_relationships enable row level security;
drop policy if exists nexus_org_scope on organization_relationships;
drop policy if exists orel_select on organization_relationships;
drop policy if exists orel_insert on organization_relationships;
drop policy if exists orel_update on organization_relationships;
drop policy if exists orel_delete on organization_relationships;

create policy orel_select on organization_relationships for select
  using (nexus_is_org_member(source_organization_id) or nexus_is_org_member(target_organization_id));

-- Only the initiating org may propose a relationship.
create policy orel_insert on organization_relationships for insert
  with check (nexus_is_org_member(source_organization_id));

-- Either side may update status (the target accepts).
create policy orel_update on organization_relationships for update
  using (nexus_is_org_member(source_organization_id) or nexus_is_org_member(target_organization_id))
  with check (nexus_is_org_member(source_organization_id) or nexus_is_org_member(target_organization_id));

-- Either side may remove it (removes for both).
create policy orel_delete on organization_relationships for delete
  using (nexus_is_org_member(source_organization_id) or nexus_is_org_member(target_organization_id));
