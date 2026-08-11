-- Who owns a person's password.
--
-- A club admin sets a starting password so a new member can get in. That is safe
-- while nobody owns the account — but the credential is SHARED across every club
-- the person belongs to, so once they have set their own password, an admin
-- setting it again would hand one club a working key to another club's member.
--
-- `claimed_at` is the line between those two states. Null: unclaimed, an admin
-- may set a starting password and the app forces a change at first sign-in. Set:
-- the person owns it, admins are refused, and the only way back in is a
-- single-use CLAIM CODE an admin issues and reads out — which lets them set a new
-- password themselves without anyone else ever knowing it.
--
-- No email is wired in this stack, which is why recovery is a code rather than a
-- reset link. The shape is the same either way.
alter table profiles add column if not exists claimed_at timestamptz;

-- The pending claim code: a SHA-256 of the code (never the code itself), plus its
-- expiry. Single-use — redeeming clears both columns.
alter table profiles add column if not exists claim_code_hash text;
alter table profiles add column if not exists claim_code_expires_at timestamptz;

-- Codes are read aloud, so they are short; the expiry is what keeps that safe.
-- Finding one by hash has to be indexed, since redemption arrives with a code and
-- an email but the lookup is by both.
create index if not exists profiles_claim_code_idx
  on profiles (claim_code_hash)
  where claim_code_hash is not null;

-- Everyone who already signed in and changed their own password predates this
-- column. Treating them as UNCLAIMED would be wrong (an admin could reset them);
-- treating them as claimed would be wrong too (the app would never prompt anyone
-- to pick their own). They are left null deliberately: unclaimed, so the app
-- prompts once, and after that they own it. One prompt is the honest cost of
-- introducing ownership after the fact.
