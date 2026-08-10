-- Pictures in the club chat.
--
-- Same storage decision as profile pictures (0043) and club headers (0044): a
-- base64 data URL on the row. The app downsizes to 1280 on the long edge before
-- upload, which lands a few hundred kilobytes — enough for a screenshot of a
-- hand, and the cap below is the guard that keeps it so.
alter table club_chat_messages add column if not exists image text;

alter table club_chat_messages drop constraint if exists club_chat_messages_image_shape;
alter table club_chat_messages add constraint club_chat_messages_image_shape check (
  image is null
  or (image like 'data:image/jpeg;base64,%' and char_length(image) <= 900000)
  or (image like 'data:image/png;base64,%' and char_length(image) <= 900000)
  or (image like 'data:image/webp;base64,%' and char_length(image) <= 900000)
);

-- A picture may be sent with no words, so the body's 1-character floor has to
-- go; what must stay true is that a message carries SOMETHING. The replacement
-- says exactly that, and still caps the text.
alter table club_chat_messages drop constraint if exists club_chat_messages_body_len;
alter table club_chat_messages add constraint club_chat_messages_body_len
  check (char_length(body) <= 2000);

alter table club_chat_messages drop constraint if exists club_chat_messages_not_empty;
alter table club_chat_messages add constraint club_chat_messages_not_empty
  check (char_length(btrim(body)) > 0 or image is not null);
