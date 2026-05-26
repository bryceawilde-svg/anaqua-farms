-- Pest / weed / disease library
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/mlxaljozizaarvdcssew/sql/new

CREATE TABLE IF NOT EXISTS pests (
  id         bigserial PRIMARY KEY,
  name       text NOT NULL,
  user_id    uuid REFERENCES auth.users(id),
  org_id     uuid REFERENCES organizations(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE pests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pests_select" ON pests FOR SELECT USING (
  (org_id IS NOT NULL AND org_id = ANY(public.user_org_ids()))
  OR (org_id IS NULL AND user_id = auth.uid())
);
CREATE POLICY "pests_insert" ON pests FOR INSERT WITH CHECK (
  (org_id IS NOT NULL AND org_id = ANY(public.user_owner_org_ids()))
  OR (org_id IS NULL AND user_id = auth.uid())
);
CREATE POLICY "pests_update" ON pests FOR UPDATE USING (
  (org_id IS NOT NULL AND org_id = ANY(public.user_owner_org_ids()))
  OR (org_id IS NULL AND user_id = auth.uid())
);
CREATE POLICY "pests_delete" ON pests FOR DELETE USING (
  (org_id IS NOT NULL AND org_id = ANY(public.user_owner_org_ids()))
  OR (org_id IS NULL AND user_id = auth.uid())
);
