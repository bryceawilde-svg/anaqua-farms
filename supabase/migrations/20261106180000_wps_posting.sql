-- The WPS central posting display (40 CFR 170.311) needs two things BoomLog did
-- not store: a safety data sheet for each product applied, and the emergency
-- medical and state regulatory agency contacts that belong on the same display.

-- A link, not a file: the farm pastes the manufacturer's SDS URL onto the
-- chemical. The posting resolves it by product name against the library, the way
-- the adjuvant check already does, so tickets written before the link existed
-- pick it up without a backfill.
ALTER TABLE chemicals ADD COLUMN IF NOT EXISTS sds_url text;

-- { medical: { name, address, phone }, agency: { name, address, phone } }
--
-- Deliberately empty to begin with. The medical entry has to be a facility that
-- is actually operating near this farm, and the agency entry is whichever state
-- regulator covers it. Pre-filling either with a plausible guess would put an
-- unverified phone number on a display workers are meant to use in an emergency.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS posting_contacts jsonb;
