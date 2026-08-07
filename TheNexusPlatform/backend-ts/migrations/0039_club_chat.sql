-- Club chat: one message thread per program (§ Bridge app "Club → Chat").
--
-- Program-scoped rather than org-scoped: a partner club (e.g. Club 1) is a
-- program, and its chat must not be visible to the rest of the org. Everyone
-- with a membership in the program can read and post; the app gates on that.
--
-- Authors are stored as PROFILE ids, not auth-user ids, because that is what
-- org_memberships references and what the roster resolves names from. The
-- author's display name and role are NOT copied here — they are joined at read
-- time so a rename or a promotion is reflected in old messages too.
create table if not exists club_chat_messages (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs (id) on delete cascade,
  author_profile_id uuid not null,
  body text not null,
  -- Pinning is a property of the message, not of the reader: the design shows
  -- one shared pin list for the club, so any member's pin is everyone's.
  pinned_at timestamptz,
  pinned_by uuid,
  created_at timestamptz not null default now()
);

alter table club_chat_messages drop constraint if exists club_chat_messages_body_len;
alter table club_chat_messages add constraint club_chat_messages_body_len
  check (char_length(body) between 1 and 2000);

-- The only read pattern is "this club's thread, oldest first".
create index if not exists club_chat_messages_program_created_idx
  on club_chat_messages (program_id, created_at);

-- Backend-only table, same treatment as the tables 0037 hardened: RLS on, with
-- a single nexus_app policy. Authorization (are you a member of this club?) is
-- enforced in the route, and no other role — anon, authenticated,
-- bridge_service, learning_service — has any business here.
alter table club_chat_messages enable row level security;
drop policy if exists nexus_backend_only on club_chat_messages;
create policy nexus_backend_only on club_chat_messages
  for all to nexus_app using (true) with check (true);
