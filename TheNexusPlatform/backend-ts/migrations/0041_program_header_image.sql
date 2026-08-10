-- A club's header image — the banner behind its name on the app's Club tab.
--
-- Same storage decision as profile pictures (0040): a base64 data URL on the row
-- rather than object storage. The app downsizes to 1080 wide before upload, so
-- this is a few hundred kilobytes at most, and every surface that draws it is
-- already fetching the club it belongs to.
--
-- Wider cap than an avatar because this is a full-bleed banner, not a 29pt face.
alter table programs add column if not exists header_image text;

alter table programs drop constraint if exists programs_header_image_shape;
alter table programs add constraint programs_header_image_shape check (
  header_image is null
  or (header_image like 'data:image/jpeg;base64,%' and char_length(header_image) <= 900000)
  or (header_image like 'data:image/png;base64,%' and char_length(header_image) <= 900000)
  or (header_image like 'data:image/webp;base64,%' and char_length(header_image) <= 900000)
);
