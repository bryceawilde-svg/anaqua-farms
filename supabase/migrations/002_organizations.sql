-- ============================================================
-- Multi-tenant organization model
-- Run this entire file in the Supabase SQL Editor
-- https://supabase.com/dashboard/project/mlxaljozizaarvdcssew/sql/new
-- ============================================================

-- 1. Organizations and memberships tables
CREATE TABLE IF NOT EXISTS organizations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS org_memberships (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES auth.users(id),
  role          text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member', 'viewer')),
  invited_email text,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending')),
  created_at    timestamptz DEFAULT now(),
  UNIQUE(org_id, user_id)
);

-- 2. Add org_id to all data tables
ALTER TABLE fields                   ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
ALTER TABLE chemicals                ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
ALTER TABLE equipment                ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
ALTER TABLE licensed_applicators     ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
ALTER TABLE non_licensed_applicators ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
ALTER TABLE tickets                  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
ALTER TABLE crop_seasons             ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);

-- 3. Helper functions (SECURITY DEFINER avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.user_org_ids()
RETURNS uuid[] LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE(ARRAY_AGG(org_id), '{}')
  FROM org_memberships
  WHERE user_id = auth.uid() AND status = 'active'
$$;

CREATE OR REPLACE FUNCTION public.user_owner_org_ids()
RETURNS uuid[] LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE(ARRAY_AGG(org_id), '{}')
  FROM org_memberships
  WHERE user_id = auth.uid() AND role = 'owner' AND status = 'active'
$$;

-- 4. Drop old user_id-based RLS policies
DO $$ BEGIN
  DROP POLICY IF EXISTS "fields_select"      ON fields;
  DROP POLICY IF EXISTS "fields_insert"      ON fields;
  DROP POLICY IF EXISTS "fields_update"      ON fields;
  DROP POLICY IF EXISTS "fields_delete"      ON fields;
  DROP POLICY IF EXISTS "chemicals_select"   ON chemicals;
  DROP POLICY IF EXISTS "chemicals_insert"   ON chemicals;
  DROP POLICY IF EXISTS "chemicals_update"   ON chemicals;
  DROP POLICY IF EXISTS "chemicals_delete"   ON chemicals;
  DROP POLICY IF EXISTS "equipment_select"   ON equipment;
  DROP POLICY IF EXISTS "equipment_insert"   ON equipment;
  DROP POLICY IF EXISTS "equipment_update"   ON equipment;
  DROP POLICY IF EXISTS "equipment_delete"   ON equipment;
  DROP POLICY IF EXISTS "lic_app_select"     ON licensed_applicators;
  DROP POLICY IF EXISTS "lic_app_insert"     ON licensed_applicators;
  DROP POLICY IF EXISTS "lic_app_update"     ON licensed_applicators;
  DROP POLICY IF EXISTS "lic_app_delete"     ON licensed_applicators;
  DROP POLICY IF EXISTS "nonlic_app_select"  ON non_licensed_applicators;
  DROP POLICY IF EXISTS "nonlic_app_insert"  ON non_licensed_applicators;
  DROP POLICY IF EXISTS "nonlic_app_update"  ON non_licensed_applicators;
  DROP POLICY IF EXISTS "nonlic_app_delete"  ON non_licensed_applicators;
  DROP POLICY IF EXISTS "tickets_select"     ON tickets;
  DROP POLICY IF EXISTS "tickets_insert"     ON tickets;
  DROP POLICY IF EXISTS "tickets_update"     ON tickets;
  DROP POLICY IF EXISTS "tickets_delete"     ON tickets;
  DROP POLICY IF EXISTS "crop_seasons_select" ON crop_seasons;
  DROP POLICY IF EXISTS "crop_seasons_insert" ON crop_seasons;
  DROP POLICY IF EXISTS "crop_seasons_update" ON crop_seasons;
  DROP POLICY IF EXISTS "crop_seasons_delete" ON crop_seasons;
END $$;

-- 5. New org-based RLS policies
-- Fallback clause (org_id IS NULL AND user_id = auth.uid()) lets existing rows
-- remain readable while Bryce is setting up the org — they get claimed on org creation.

-- Fields — owner-write, all-member-read
CREATE POLICY "fields_select" ON fields FOR SELECT USING (
  (org_id IS NOT NULL AND org_id = ANY(public.user_org_ids()))
  OR (org_id IS NULL AND user_id = auth.uid())
);
CREATE POLICY "fields_insert" ON fields FOR INSERT WITH CHECK (
  (org_id IS NOT NULL AND org_id = ANY(public.user_owner_org_ids()))
  OR (org_id IS NULL AND user_id = auth.uid())
);
CREATE POLICY "fields_update" ON fields FOR UPDATE USING (
  (org_id IS NOT NULL AND org_id = ANY(public.user_owner_org_ids()))
  OR (org_id IS NULL AND user_id = auth.uid())
);
CREATE POLICY "fields_delete" ON fields FOR DELETE USING (
  (org_id IS NOT NULL AND org_id = ANY(public.user_owner_org_ids()))
  OR (org_id IS NULL AND user_id = auth.uid())
);

-- Chemicals — owner-write
CREATE POLICY "chemicals_select" ON chemicals FOR SELECT USING (
  (org_id IS NOT NULL AND org_id = ANY(public.user_org_ids()))
  OR (org_id IS NULL AND user_id = auth.uid())
);
CREATE POLICY "chemicals_insert" ON chemicals FOR INSERT WITH CHECK (
  (org_id IS NOT NULL AND org_id = ANY(public.user_owner_org_ids()))
  OR (org_id IS NULL AND user_id = auth.uid())
);
CREATE POLICY "chemicals_update" ON chemicals FOR UPDATE USING (
  (org_id IS NOT NULL AND org_id = ANY(public.user_owner_org_ids()))
  OR (org_id IS NULL AND user_id = auth.uid())
);
CREATE POLICY "chemicals_delete" ON chemicals FOR DELETE USING (
  (org_id IS NOT NULL AND org_id = ANY(public.user_owner_org_ids()))
  OR (org_id IS NULL AND user_id = auth.uid())
);

-- Equipment — owner-write
CREATE POLICY "equipment_select" ON equipment FOR SELECT USING (
  (org_id IS NOT NULL AND org_id = ANY(public.user_org_ids()))
  OR (org_id IS NULL AND user_id = auth.uid())
);
CREATE POLICY "equipment_insert" ON equipment FOR INSERT WITH CHECK (
  (org_id IS NOT NULL AND org_id = ANY(public.user_owner_org_ids()))
  OR (org_id IS NULL AND user_id = auth.uid())
);
CREATE POLICY "equipment_update" ON equipment FOR UPDATE USING (
  (org_id IS NOT NULL AND org_id = ANY(public.user_owner_org_ids()))
  OR (org_id IS NULL AND user_id = auth.uid())
);
CREATE POLICY "equipment_delete" ON equipment FOR DELETE USING (
  (org_id IS NOT NULL AND org_id = ANY(public.user_owner_org_ids()))
  OR (org_id IS NULL AND user_id = auth.uid())
);

-- Licensed applicators — owner-write
CREATE POLICY "lic_app_select" ON licensed_applicators FOR SELECT USING (
  (org_id IS NOT NULL AND org_id = ANY(public.user_org_ids()))
  OR (org_id IS NULL AND user_id = auth.uid())
);
CREATE POLICY "lic_app_insert" ON licensed_applicators FOR INSERT WITH CHECK (
  (org_id IS NOT NULL AND org_id = ANY(public.user_owner_org_ids()))
  OR (org_id IS NULL AND user_id = auth.uid())
);
CREATE POLICY "lic_app_update" ON licensed_applicators FOR UPDATE USING (
  (org_id IS NOT NULL AND org_id = ANY(public.user_owner_org_ids()))
  OR (org_id IS NULL AND user_id = auth.uid())
);
CREATE POLICY "lic_app_delete" ON licensed_applicators FOR DELETE USING (
  (org_id IS NOT NULL AND org_id = ANY(public.user_owner_org_ids()))
  OR (org_id IS NULL AND user_id = auth.uid())
);

-- Non-licensed applicators — owner-write
CREATE POLICY "nonlic_app_select" ON non_licensed_applicators FOR SELECT USING (
  (org_id IS NOT NULL AND org_id = ANY(public.user_org_ids()))
  OR (org_id IS NULL AND user_id = auth.uid())
);
CREATE POLICY "nonlic_app_insert" ON non_licensed_applicators FOR INSERT WITH CHECK (
  (org_id IS NOT NULL AND org_id = ANY(public.user_owner_org_ids()))
  OR (org_id IS NULL AND user_id = auth.uid())
);
CREATE POLICY "nonlic_app_update" ON non_licensed_applicators FOR UPDATE USING (
  (org_id IS NOT NULL AND org_id = ANY(public.user_owner_org_ids()))
  OR (org_id IS NULL AND user_id = auth.uid())
);
CREATE POLICY "nonlic_app_delete" ON non_licensed_applicators FOR DELETE USING (
  (org_id IS NOT NULL AND org_id = ANY(public.user_owner_org_ids()))
  OR (org_id IS NULL AND user_id = auth.uid())
);

-- Tickets — any member can write (operators create spray records)
CREATE POLICY "tickets_select" ON tickets FOR SELECT USING (
  (org_id IS NOT NULL AND org_id = ANY(public.user_org_ids()))
  OR (org_id IS NULL AND user_id = auth.uid())
);
CREATE POLICY "tickets_insert" ON tickets FOR INSERT WITH CHECK (
  (org_id IS NOT NULL AND org_id = ANY(public.user_org_ids()))
  OR (org_id IS NULL AND user_id = auth.uid())
);
CREATE POLICY "tickets_update" ON tickets FOR UPDATE USING (
  (org_id IS NOT NULL AND org_id = ANY(public.user_org_ids()))
  OR (org_id IS NULL AND user_id = auth.uid())
);
CREATE POLICY "tickets_delete" ON tickets FOR DELETE USING (
  (org_id IS NOT NULL AND org_id = ANY(public.user_org_ids()))
  OR (org_id IS NULL AND user_id = auth.uid())
);

-- Crop seasons — owner-write
CREATE POLICY "crop_seasons_select" ON crop_seasons FOR SELECT USING (
  (org_id IS NOT NULL AND org_id = ANY(public.user_org_ids()))
  OR (org_id IS NULL AND user_id = auth.uid())
);
CREATE POLICY "crop_seasons_insert" ON crop_seasons FOR INSERT WITH CHECK (
  (org_id IS NOT NULL AND org_id = ANY(public.user_owner_org_ids()))
  OR (org_id IS NULL AND user_id = auth.uid())
);
CREATE POLICY "crop_seasons_update" ON crop_seasons FOR UPDATE USING (
  (org_id IS NOT NULL AND org_id = ANY(public.user_owner_org_ids()))
  OR (org_id IS NULL AND user_id = auth.uid())
);
CREATE POLICY "crop_seasons_delete" ON crop_seasons FOR DELETE USING (
  (org_id IS NOT NULL AND org_id = ANY(public.user_owner_org_ids()))
  OR (org_id IS NULL AND user_id = auth.uid())
);

-- 6. Organizations table RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orgs_select" ON organizations FOR SELECT USING (id = ANY(public.user_org_ids()));
CREATE POLICY "orgs_update" ON organizations FOR UPDATE USING (id = ANY(public.user_owner_org_ids()));

-- 7. Memberships table RLS
ALTER TABLE org_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "memberships_select" ON org_memberships FOR SELECT USING (
  org_id = ANY(public.user_org_ids()) OR user_id = auth.uid()
);
CREATE POLICY "memberships_insert" ON org_memberships FOR INSERT WITH CHECK (
  org_id = ANY(public.user_owner_org_ids())
);
CREATE POLICY "memberships_update" ON org_memberships FOR UPDATE USING (
  org_id = ANY(public.user_owner_org_ids())
);
CREATE POLICY "memberships_delete" ON org_memberships FOR DELETE USING (
  org_id = ANY(public.user_owner_org_ids())
);

-- 8. SECURITY DEFINER functions for privileged operations

-- Creates an org, adds caller as owner, claims all existing user rows
CREATE OR REPLACE FUNCTION public.create_organization(org_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_org_id uuid;
  uid        uuid := auth.uid();
BEGIN
  INSERT INTO organizations (name, created_by) VALUES (org_name, uid)
  RETURNING id INTO new_org_id;

  INSERT INTO org_memberships (org_id, user_id, role, status, invited_email)
  VALUES (new_org_id, uid, 'owner', 'active',
          (SELECT email FROM auth.users WHERE id = uid));

  -- Claim existing user rows that predate the org model
  UPDATE fields                   SET org_id = new_org_id WHERE user_id = uid AND org_id IS NULL;
  UPDATE chemicals                SET org_id = new_org_id WHERE user_id = uid AND org_id IS NULL;
  UPDATE equipment                SET org_id = new_org_id WHERE user_id = uid AND org_id IS NULL;
  UPDATE licensed_applicators     SET org_id = new_org_id WHERE user_id = uid AND org_id IS NULL;
  UPDATE non_licensed_applicators SET org_id = new_org_id WHERE user_id = uid AND org_id IS NULL;
  UPDATE tickets                  SET org_id = new_org_id WHERE user_id = uid AND org_id IS NULL;
  UPDATE crop_seasons             SET org_id = new_org_id WHERE user_id = uid AND org_id IS NULL;

  RETURN new_org_id;
END;
$$;

-- Converts pending invites for the caller's email into active memberships
CREATE OR REPLACE FUNCTION public.claim_pending_invites()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid        uuid := auth.uid();
  user_email text;
BEGIN
  SELECT email INTO user_email FROM auth.users WHERE id = uid;
  UPDATE org_memberships
  SET user_id = uid, status = 'active'
  WHERE invited_email = user_email AND status = 'pending' AND user_id IS NULL;
END;
$$;

-- 9. Grants
GRANT SELECT, INSERT, UPDATE ON organizations    TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON org_memberships TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_organization(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pending_invites()   TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_org_ids()            TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.user_owner_org_ids()      TO authenticated, anon;

-- 10. Indexes
CREATE INDEX IF NOT EXISTS idx_org_memberships_user_id ON org_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_org_id  ON org_memberships(org_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_email   ON org_memberships(invited_email);
CREATE INDEX IF NOT EXISTS idx_fields_org_id           ON fields(org_id);
CREATE INDEX IF NOT EXISTS idx_chemicals_org_id        ON chemicals(org_id);
CREATE INDEX IF NOT EXISTS idx_equipment_org_id        ON equipment(org_id);
CREATE INDEX IF NOT EXISTS idx_tickets_org_id          ON tickets(org_id);
CREATE INDEX IF NOT EXISTS idx_crop_seasons_org_id     ON crop_seasons(org_id);
