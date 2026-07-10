-- Brain Bee Studio: persist instructor course model on the course row
alter table courses
  add column if not exists content_policy text not null default 'generate'
    check (content_policy in ('strict', 'generate', 'open'));

alter table courses
  add column if not exists studio_json jsonb;
