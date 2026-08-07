-- Optional username as a second sign-in identifier.
--
-- Email stays the canonical key (auth users are keyed by it); a username is an
-- alias an admin can hand out so a member can sign in without an email address.
-- Nullable, because most people will never have one.
--
-- Case-insensitively unique across the whole platform: a username has to resolve
-- to exactly one account at sign-in, where no org is known yet. Stored as typed
-- so the console can show "Ashvin" rather than "ashvin", and matched lowercased.
alter table profiles add column if not exists username text;

-- A partial index so the many NULLs don't collide, and lower() so "Ashvin" and
-- "ashvin" cannot both exist.
create unique index if not exists profiles_username_lower_key
  on profiles (lower(username))
  where username is not null;

-- Shape rules enforced at the edge too (see usernameSchema in schemas.ts); kept
-- here so a direct SQL insert can't create something unusable as a login.
alter table profiles drop constraint if exists profiles_username_shape;
alter table profiles add constraint profiles_username_shape check (
  username is null
  or (char_length(username) between 3 and 32 and username ~ '^[A-Za-z0-9._-]+$')
);
