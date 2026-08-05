-- Program categories are org-defined free text (the UI removed the edu/game
-- presets; "game" keeps its Coach/Player role words by convention). Drop the
-- preset CHECK so orgs can name categories whatever they want.
alter table programs drop constraint if exists programs_category_check;
