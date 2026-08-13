-- Friends: a link between two people, independent of any club.
--
-- Everything else this app scopes — challenges, content, roles — belongs to a club.
-- A friendship deliberately does not. It is person-to-person, it survives someone
-- leaving a club or joining another, and it is what makes "search by username or
-- email" a sensible way to find someone: club membership is not the question being
-- asked.
--
-- ONE ROW PER PAIR, whichever way round it was made. A friendship is symmetric once
-- accepted, but the ROW is directed — it records who asked, which is the only way to
-- tell an incoming request from an outgoing one. The unique index below is on the
-- ORDERED pair, so A→B and B→A cannot both exist and the second person to ask gets a
-- conflict rather than a duplicate. That also makes "are we friends?" one lookup
-- instead of two.
--
-- `status` is the whole lifecycle: pending → accepted, or pending → declined.
-- Declined rows are KEPT rather than deleted, so a refusal is not an invitation to
-- ask again immediately; re-asking updates the existing row rather than inserting.
--
-- The profile ids here are org-scoped (profiles carries organization_id), which for
-- this deployment means one row per person. If accounts ever span orgs, a friendship
-- would need to key on the person rather than the profile — noted here because it is
-- the kind of thing that is invisible until it is not.

create table if not exists friendships (
  id            uuid primary key default uuid_generate_v4(),
  -- Who asked. Directed, so the requests tab can tell incoming from outgoing.
  requester_id  uuid not null references profiles(id) on delete cascade,
  addressee_id  uuid not null references profiles(id) on delete cascade,
  status        text not null default 'pending'
                check (status in ('pending', 'accepted', 'declined')),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  -- Nobody is their own friend. Cheap to enforce here, and it means no route has to
  -- remember to check.
  constraint friendships_not_self check (requester_id <> addressee_id)
);

-- The pair, in a canonical order, so direction cannot smuggle in a duplicate.
create unique index if not exists friendships_pair_key
  on friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

-- "My friends" and "my incoming requests" are the two reads the app makes on every
-- open of the screen; both are covered.
create index if not exists friendships_requester_idx on friendships (requester_id, status);
create index if not exists friendships_addressee_idx on friendships (addressee_id, status);
