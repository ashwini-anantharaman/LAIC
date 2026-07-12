-- Two-sided consent for program ↔ organization affiliations.
--
-- Org A (the program's org) invites Org B (organization_id) to affiliate with a
-- program. Org B must be able to ACCEPT/DECLINE — i.e. UPDATE the row — not just
-- read it. The original single policy allowed either side to SELECT but only the
-- program's org to write (with check), so Org B could never accept. We split it
-- into per-command policies: the program's org creates/deletes; either side may
-- update the status (accept/decline/pause).

alter table program_organization_affiliations enable row level security;
drop policy if exists nexus_org_scope on program_organization_affiliations;
drop policy if exists poa_select on program_organization_affiliations;
drop policy if exists poa_insert on program_organization_affiliations;
drop policy if exists poa_update on program_organization_affiliations;
drop policy if exists poa_delete on program_organization_affiliations;

-- Either the invited org or the program's org can see the affiliation.
create policy poa_select on program_organization_affiliations for select
  using (
    nexus_is_org_member(organization_id)
    or nexus_is_org_member((select org_id from programs p where p.id = program_id))
  );

-- Only the program's org (Org A) may create the invite.
create policy poa_insert on program_organization_affiliations for insert
  with check (nexus_is_org_member((select org_id from programs p where p.id = program_id)));

-- Both sides may update status: Org A can cancel/pause, Org B can accept/decline.
create policy poa_update on program_organization_affiliations for update
  using (
    nexus_is_org_member(organization_id)
    or nexus_is_org_member((select org_id from programs p where p.id = program_id))
  )
  with check (
    nexus_is_org_member(organization_id)
    or nexus_is_org_member((select org_id from programs p where p.id = program_id))
  );

-- Only the program's org may delete.
create policy poa_delete on program_organization_affiliations for delete
  using (nexus_is_org_member((select org_id from programs p where p.id = program_id)));
