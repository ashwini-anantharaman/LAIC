-- Profile pictures.
--
-- Stored IN the row, as a base64 data URL, rather than in object storage: the
-- app downsizes to 256x256 JPEG before upload (~30-60 kB), every surface that
-- shows one — club roster, chat, app bar — already fetches the row it hangs off,
-- and a bucket would add credentials, lifecycle and CORS for no gain at this
-- size. The check constraint is the guard that keeps that assumption true.
alter table profiles add column if not exists avatar text;

alter table profiles drop constraint if exists profiles_avatar_shape;
alter table profiles add constraint profiles_avatar_shape check (
  avatar is null
  -- A data URL for one of the three formats a phone camera produces, capped at
  -- 200 kB of base64 (~150 kB of image) so a row can never become a payload.
  or (avatar like 'data:image/jpeg;base64,%' and char_length(avatar) <= 200000)
  or (avatar like 'data:image/png;base64,%' and char_length(avatar) <= 200000)
  or (avatar like 'data:image/webp;base64,%' and char_length(avatar) <= 200000)
);
