-- Portable auth.uid() shim — Nexus v0.4 (canonical TS backend).
--
-- The org-scoped RLS policies (0004/0005/0006) reference auth.uid(), which is
-- provided by Supabase. On a plain PostgreSQL (local dev, RDS, Cloud SQL, CI)
-- that function does not exist, so the migrations would fail. This creates a
-- compatible stub ONLY IF auth.uid() is absent, so it is a no-op on Supabase
-- (never clobbers Supabase's real function).
--
-- The stub resolves the current user from a GUC, which is exactly the seam the
-- backend will bind per-request in Slice 2 (SET LOCAL). Until then it returns
-- NULL when unset, so service-role/local access still works.
do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'uid'
  ) then
    create schema if not exists auth;
    execute $fn$
      create function auth.uid() returns uuid
      language sql stable
      as $body$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $body$;
    $fn$;
  end if;
end $$;
