-- Capture the invitee's intended name at invite time, so it (a) shows up
-- immediately in the org's members/administrators lists while still pending,
-- and (b) pre-fills their profile when they accept (they can still edit it).
alter table invitations add column if not exists display_name text;
