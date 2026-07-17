-- Phase 5: a course offering can carry a linked Learning Platform content
-- package (by reference, never cloned). Populated by the real LP when it
-- lands; displayed by the console today.
alter table offerings add column if not exists content_package jsonb;
