-- Gates are a distinct entry mechanism, so gate sign-ups get their own
-- registration_source. Extends the 0005 check (idempotent: drop + re-add).
alter table registrations drop constraint if exists registrations_registration_source_check;
alter table registrations add constraint registrations_registration_source_check
  check (registration_source in ('app_hook', 'admin_add', 'coach_add', 'invite_link', 'bulk_import', 'gate_signup'));
