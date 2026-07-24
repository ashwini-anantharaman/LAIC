-- Gates gain a level: program (existing, org+program scoped), organization
-- (org-scoped staff onboarding), or nexus (operator, later phase). Program-less
-- gates need program_id nullable; existing rows stay 'program'.
alter table gates alter column program_id drop not null;
alter table gates add column if not exists level text not null default 'program';
alter table gates drop constraint if exists gates_level_check;
alter table gates add constraint gates_level_check check (level in ('program','organization','nexus'));
