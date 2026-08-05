-- Nexus (operator) gates + the mandatory approval queue.
--
-- Operator gates admit people to the PLATFORM altitude (a confined nexus role),
-- so they have no organization. Relax the NOT NULL that program/org gates relied
-- on. (The runner replays every migration lexically; keep this idempotent.)
alter table gates alter column organization_id drop not null;

-- A pending membership request raised by a gate whose admission is approval-gated
-- (mandatory for nexus gates). Approving it applies the role the gate offered;
-- until then the person has an account but no operator access.
create table if not exists gate_member_requests (
  id            uuid primary key default gen_random_uuid(),
  gate_id       uuid not null references gates(id) on delete cascade,
  -- Which altitude the request admits to. Currently only 'nexus' is queued, but
  -- the column lets org/program member gates adopt approval later without a
  -- schema change.
  level         text not null default 'nexus',
  email         text not null,
  display_name  text,
  -- The nexus/program/org role the approval will assign (chosen from the gate's
  -- offered set). Null → base access only.
  role_id       uuid,
  status        text not null default 'pending',
  created_at    timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    uuid
);

do $$ begin
  alter table gate_member_requests
    add constraint gate_member_requests_status_check
    check (status in ('pending','approved','rejected'));
exception when duplicate_object then null; end $$;

create index if not exists gate_member_requests_status_idx
  on gate_member_requests (status, created_at desc);
create index if not exists gate_member_requests_gate_idx
  on gate_member_requests (gate_id);
