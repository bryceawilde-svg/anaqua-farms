-- Bearer tokens for machine exports (the Google Sheets TDA pull).
--
-- Replaces the email+password that sheets-export took in its POST body, which
-- meant the Apps Script on the spreadsheet stored an account password and the
-- function — deployed with verify_jwt false — doubled as a credential-stuffing
-- target for every account in the project.
--
-- Deliberately NOT rei_links. A posting token is meant to be scanned by anyone at
-- a gate; this one returns the full TDA record including applicator names and
-- licence numbers. One table holding both is one policy mistake away from handing
-- a gate poster the entire export.

CREATE TABLE IF NOT EXISTS export_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token        text NOT NULL UNIQUE CHECK (token ~ '^[A-Za-z0-9_-]{32,64}$'),
  label        text,
  created_by   uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  expires_at   timestamptz,
  revoked_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_export_tokens_org_id ON export_tokens(org_id);

ALTER TABLE export_tokens ENABLE ROW LEVEL SECURITY;

-- Owners only, SELECT included: unlike a posting link this value is a credential,
-- so an ordinary member has no reason to read it.
DROP POLICY IF EXISTS "export_tokens_select" ON export_tokens;
DROP POLICY IF EXISTS "export_tokens_insert" ON export_tokens;
DROP POLICY IF EXISTS "export_tokens_update" ON export_tokens;
DROP POLICY IF EXISTS "export_tokens_delete" ON export_tokens;

CREATE POLICY "export_tokens_select" ON export_tokens FOR SELECT USING (
  org_id = ANY(public.user_owner_org_ids())
);
CREATE POLICY "export_tokens_insert" ON export_tokens FOR INSERT WITH CHECK (
  org_id = ANY(public.user_owner_org_ids())
);
CREATE POLICY "export_tokens_update" ON export_tokens FOR UPDATE USING (
  org_id = ANY(public.user_owner_org_ids())
);
CREATE POLICY "export_tokens_delete" ON export_tokens FOR DELETE USING (
  org_id = ANY(public.user_owner_org_ids())
);

GRANT SELECT, INSERT, UPDATE, DELETE ON export_tokens TO authenticated;
