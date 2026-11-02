-- Public REI posting links.
--
-- A token-gated, revocable view of one org's recent applications, for workers to
-- scan at a field gate.
--
-- The token is stored in the clear rather than hashed: a posting has to be
-- re-printable from any device months later, and a hash-only row could never show
-- the link again. It is a low-sensitivity capability — it reaches one read-only
-- posting whose whole purpose is to be readable by any worker at a gate — and the
-- row itself is reachable only by the owning org under the policies below.
-- Rotate by inserting a new link and revoking the old one.
--
-- anon deliberately gets NO policy here and no grant. The public page reads
-- through the rei-report edge function (service role), never through PostgREST,
-- so a posting token cannot reach tickets, fields, chemicals or anything else.

-- REI is wall-clock on the farm: without the org's zone, "is this field still
-- restricted" is wrong by hours. Nullable on purpose — the Account page makes the
-- owner set it before a posting link can be created, rather than guessing a zone.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS timezone text;

CREATE TABLE IF NOT EXISTS rei_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token       text NOT NULL UNIQUE CHECK (token ~ '^[A-Za-z0-9_-]{16,64}$'),
  label       text,
  window_days int  NOT NULL DEFAULT 30 CHECK (window_days BETWEEN 1 AND 365),
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz,
  revoked_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_rei_links_org_id ON rei_links(org_id);

ALTER TABLE rei_links ENABLE ROW LEVEL SECURITY;

-- Members can see their org's links (to print a posting); only owners mint or revoke.
DROP POLICY IF EXISTS "rei_links_select" ON rei_links;
DROP POLICY IF EXISTS "rei_links_insert" ON rei_links;
DROP POLICY IF EXISTS "rei_links_update" ON rei_links;
DROP POLICY IF EXISTS "rei_links_delete" ON rei_links;

CREATE POLICY "rei_links_select" ON rei_links FOR SELECT USING (
  org_id = ANY(public.user_org_ids())
);
CREATE POLICY "rei_links_insert" ON rei_links FOR INSERT WITH CHECK (
  org_id = ANY(public.user_owner_org_ids())
);
CREATE POLICY "rei_links_update" ON rei_links FOR UPDATE USING (
  org_id = ANY(public.user_owner_org_ids())
);
CREATE POLICY "rei_links_delete" ON rei_links FOR DELETE USING (
  org_id = ANY(public.user_owner_org_ids())
);

GRANT SELECT, INSERT, UPDATE, DELETE ON rei_links TO authenticated;
