-- Add 'community' as a grantable entitlement module (the prototype's Team &
-- Roles / Community area gets a real gate, matching learning/coaching/analytics).
alter table entitlements drop constraint if exists entitlements_module_check;
alter table entitlements add constraint entitlements_module_check
  check (module = any (array['nexus', 'learning', 'coaching', 'analytics', 'community']));
