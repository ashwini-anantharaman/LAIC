-- A gate admits one of two audiences:
--   'participant' — students → a learner participant (Registrations).
--   'member'      — internal staff → a program membership + role (Team & Roles).
-- role_id is the program role granted on entry for MEMBER gates (optional).
alter table gates add column if not exists audience text not null default 'participant';
alter table gates add column if not exists role_id uuid;
alter table gates drop constraint if exists gates_audience_check;
alter table gates add constraint gates_audience_check check (audience in ('participant', 'member'));
