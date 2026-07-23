-- Removing an already-active participant sets the registration to 'removed'
-- (distinct from 'rejected', which declines a pending sign-up). The status
-- check never allowed it, so the remove action 500'd. Add it.
alter table registrations drop constraint if exists registrations_status_check;
alter table registrations add constraint registrations_status_check
  check (status = any (array[
    'pending_review','approved','rejected','waitlisted','withdrawn','directly_added','removed'
  ]));
