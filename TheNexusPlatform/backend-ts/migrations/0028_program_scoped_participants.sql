-- Participants join a PROGRAM — that's what grants platform access
-- (resolvePlatformAccess and findLearnerParticipations already key on
-- program_id, never offering_id). Offering enrollment is an optional finer
-- grain (a specific course/cohort), not the thing you join. Make offering_id
-- optional so a program-level invite / app signup needs no offering.
-- Safe + reversible: dropping NOT NULL loses no data.
alter table registrations alter column offering_id drop not null;
alter table participants alter column offering_id drop not null;
