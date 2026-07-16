-- 0012: nexus_user_id is an opaque string per the shared contract
-- (NexusBridgeContext.nexusUserId), not necessarily a uuid — stub-mode ids
-- ("user_coach_carlos") and non-Supabase identities must fit. Every other
-- table already stores user ids as text; 0002's uuid predated stub mode.

alter table bridge_user_profiles
  alter column nexus_user_id type text using nexus_user_id::text;
